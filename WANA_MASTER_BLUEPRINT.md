# WANA — Master Build Blueprint (Merged Edition)

**Women's Safety & Emergency Command Network — Web Supervisor/Admin Console, Backend, Mobile & AI roadmap**

| | |
|---|---|
| **Version** | 1.0 — merged edition |
| **Date** | 06 October 2026 |
| **Merges** | (1) `PROJECT_DOCUMENTATION.md` — current web/backend codebase description · (2) *WANA Project Audit & Production Roadmap* (04 Oct 2026) — specification audit, workstreams, security model, release gates |
| **Purpose** | One document sufficient to **build, harden and ship** WANA in controlled phases |
| **Evidence level** | Both sources are *documents*. No source code, test run, deployment or Firestore rules file was inspected. Every "finding" below is derived from what the documents say and must be **verified against the repo** in Phase 0 before being closed. |

---

## 0. How to read this document

### 0.1 Provenance tags
| Tag | Meaning |
|---|---|
| **[Code]** | Stated in the codebase document (what exists today in the web/backend repo) |
| **[Audit]** | Stated in the audit/roadmap document (spec, plan, recommendation from the audit) |
| **[New]** | Added by this merge: a conflict resolution, a gap found by comparing the two, or a design detail needed to make the plan buildable. Needs team confirmation. |

### 0.2 Status words
| Status | Meaning |
|---|---|
| **BUILT** | Described as implemented in the codebase doc; keep, add tests |
| **REWORK** | Built, but the design is unsafe or conflicts with the target; change before relying on it |
| **PARTIAL** | Some of the capability exists |
| **MISSING** | Nothing exists; must be built |
| **SPEC** | Specified only (mobile/AI features); no code evidence |

### 0.3 ID scheme
`HF` hotfix · `OPS` DevOps · `SEC` security work · `BE` backend · `FE` frontend · `M` mobile · `AI` data/AI · `QA` quality · `LEGAL` legal/privacy · `DD` design decision.
Priorities: **P0** blocks production · **P1** needed for a credible pilot · **P2** later.

### 0.4 Definition of Done (applies to every ticket)
A ticket is **Done** only when it is **implemented + tested + reviewed (by someone outside the author's track) + documented + deployable**. Appearing in a spec, or "working on my machine", never counts.

---

## 1. Executive summary

WANA is an **emergency response and monitoring platform**. A user raises an SOS on a mobile app; **regional supervisors** watch live incidents on a map in a web console; a **regional administrator** approves supervisors and audits activity. The long-term differentiator is **preventive intelligence** on mobile (follow detection, night guard, silent triggers, evidence capture, risk heatmaps).

### 1.1 Where the project stands (merged view)

| Layer | State |
|---|---|
| Web console (React 19 + Vite 7 + Mappls) | **Largely built [Code]**: auth flow, onboarding, live map, ongoing/acceptors/history pages, admin approval + logs |
| Backend (Express + MongoDB + Firebase Admin) | **Built but not production-safe [Code + New]**: several public/under-protected endpoints, in-process cleanup daemon, dual database |
| Firestore event model | **Built [Code]** (`ongoingEvents`, `acceptedEvents`, `pastEvents`, `users`) but lifecycle is thin and **no security rules are visible in the documented repo tree [New]** |
| Escalation, notifications, region routing, evidence | **MISSING** |
| Mobile safety engine & AI | **SPEC [Audit]** — separate from this repo; unverified |
| Tests, CI/CD, monitoring, backups, runbooks | **MISSING** |

### 1.2 Verdict
The web product is **functionally ahead of the audit's assumptions** (the audit treated everything as specification) but **security-behind**: the code document itself reveals several issues the audit could not see (public resolve endpoint, unfiltered legacy routes, public identity endpoints, supervisors able to pick regions that have no admin). The right move is **not** to add features yet. It is to (1) stop the leaks, (2) lock authorization into Firestore rules + custom claims, (3) build the SOS backbone (ingestion → routing → acknowledgement → escalation → resolution → audit), (4) prove it on real devices, and only then (5) layer intelligence in shadow mode.

> **One line:** *Stabilize → Secure the core → Build the SOS backbone → Prove it on devices → Add evidence & resilience → Add intelligence in shadow mode → Harden → Pilot.*
> Anything that skips a gate turns a safety product into a safety risk.

### 1.3 The eight phases at a glance
| Phase | Name | Outcome | Milestone |
|---|---|---|---|
| 0 | Stabilize & Freeze | Leaks closed, environments split, decisions recorded, CI baseline | — |
| 1 | Secure Core | Claims + rules + region model + approval state machine + audit; MongoDB retired | **M1 Secure Skeleton** |
| 2 | Control Room & Event Backbone | Idempotent SOS ingestion, server-side routing, acknowledgement/escalation, live console | **M2 Live Control Room** |
| 3 | Mobile Reliability & Complete SOS | Reliable manual SOS, background location, silent triggers, contact notification, full drill | **M3 Complete SOS** |
| 4 | Evidence & Resilience | Encrypted resumable evidence, offline queue, recovery, privacy ops | **M4 Evidence** |
| 5 | Preventive Intelligence | Risk engine, follow detection, safe-route — shadow mode first | **M5 Preventive** |
| 6 | Production Hardening | Pen test, load test, observability, backups, runbooks | **M6 Production Candidate** |
| 7 | Pilot & Launch | One region, trained supervisors, drills, KPIs | Go-live decision |

---

## 2. Source reconciliation

### 2.1 What each source contributes
| Source | Strength | Blind spot |
|---|---|---|
| Codebase doc | Real routes, schemas, flows, folder tree, what is implemented | No security rules, tests, CI, monitoring, escalation, mobile; describes some unsafe designs as features |
| Audit doc | Product vision, lifecycle, threat model, phases, gates, risk register | Assumed nothing is built; doesn't know about community responders, MongoDB specifics, the 24 h auto-archive, public endpoints |

### 2.2 Conflicts and how this blueprint resolves them
| # | Topic | Codebase says | Audit says | **Resolution [New]** |
|---|---|---|---|---|
| 1 | Database | MongoDB (admins, supervisors, logs) **and** Firestore | Remove MongoDB from scope; Firestore only | **Retire MongoDB** (DD-11). Migrate in Phase 1 (BE-20), dual-run briefly, then decommission |
| 2 | Token model | Firebase ID token → Express | Avoid parallel JWT | Already aligned. Confirm no `jsonwebtoken` dependency remains (DD-04 closed) |
| 3 | Authorization source | MongoDB lookup per request | Custom claims + rules | **Claims (`role`, `regionId`) + a `staff` status lookup in rules for fast revocation** (DD-03, BE-18) |
| 4 | Region assignment | Supervisor self-selects; events carry a `city` string compared by equality | Server-derived from validated location | **Server-side geo-routing** writes `regionId`; client `city` becomes a hint only (DD-02, BE-16) |
| 5 | Event cleanup | In-process hourly daemon auto-archives unresolved events after 24 h as "auto-resolved" | Unresolved events must never be silently dropped; STALE → human review | **Replace with scheduled jobs + STALE flag + escalation**; no silent archive of live SOS (DD-14, BE-22) |
| 6 | Resolution | Public `POST /events/resolve/:eventId`, user-initiated only | Transactional, audited, supervisor/admin can close with reason | **Authenticated, authorized, idempotent, audited; supervisor/admin close with reason** (HF-01, BE-07) |
| 7 | Approval states | Approve / Revoke | UNVERIFIED, PENDING, APPROVED, REJECTED, SUSPENDED | Adopt the audit's five states (BE-03) |
| 8 | Collections | `ongoingEvents`, `acceptedEvents`, `pastEvents`, `users` | `admins`, `supervisors`, `users`, `ongoingEvents`, `pastEvents`, `shared_trips`, `feedback` | **Merged model in §7**: add `staff`, `regions`, `auditLogs`, `notifications`, `evidence`; keep `acceptedEvents` (responders) |
| 9 | Community responders ("acceptors") | Built and displayed on map/tables | Not mentioned | **Keep**, but add governance (DD-15), rules and a backend accept flow (BE-23) |
| 10 | Stack versions | React 19, Vite 7, Node 24 tested | React 18+, Node 20 LTS proposed | **Keep React 19 / Vite 7.** Pin Node to an LTS (24 tested) via `engines` + `.nvmrc`; README says "v18+" — v18 is end-of-life, update it |
| 11 | Map provider | Mappls (MapmyIndia) v3 | DD-09 open | **Keep Mappls** (India coverage, already integrated); restrict key, minimise PII on pins (DD-09) |
| 12 | Admin bootstrap | Pre-seeded on startup via `createAdmin.js`; admins exempt from email verification | Controlled bootstrap, MFA for admin | **One-time secure bootstrap script, forced password set, enrolled MFA**; no default passwords in repo or docs (BE-21) |
| 13 | Hosting | Frontend has `vercel.json`; backend host unspecified | Not specified | **Frontend: Vercel (keep). API: container on Cloud Run. Triggers/jobs: Cloud Functions 2nd gen + Cloud Scheduler** (DD-16) |

---

## 3. Gap matrix — current codebase vs target

| # | Area | Today [Code] | Target [Audit/New] | Status | Ticket(s) | Phase |
|---|---|---|---|---|---|---|
| 1 | Email/password auth, verification | Firebase Auth; supervisors must verify; admins exempt | Keep; **MFA mandatory for admins**; rejected/suspended UX | BUILT | BE-21, FE-02 | 1 |
| 2 | Role/status resolver | `GET /auth/status/:uid` (public) | `GET /auth/me` using verified token only | REWORK | HF-04 | 0 |
| 3 | Authorization | Mongo lookups + React guards | Custom claims + Firestore rules + backend RBAC | MISSING | BE-04, BE-05, BE-18 | 1 |
| 4 | Route guard | 3-gate `ProtectedRoute` | UI convenience only; enforcement server-side | BUILT | FE-01 | 1 |
| 5 | Supervisor onboarding | Register → region → pending → dashboard | Add REJECTED/SUSPENDED; only regions that have an admin | PARTIAL | BE-03, HF-07 | 0–1 |
| 6 | Admin per region | Mongo unique index; seeded Solapur, Pune | Region registry; invariant enforced in a transaction | PARTIAL | BE-02 | 1 |
| 7 | Approval UI | Pending / Active / History tabs; approve + revoke | + reject, suspend, confirmations, double-submit safety | PARTIAL | FE-09 | 1 |
| 8 | Audit log | `SupervisorLog` (login/logout/action) in Mongo | Append-only `auditLogs` covering all privileged actions and event/evidence access | PARTIAL | BE-10 | 1 |
| 9 | Live feed | `onSnapshot` on `city == region && !is_resolved` | `regionId` + status filter; connection/stale banner; pagination | BUILT | FE-04, FE-11, FE-17 | 2 |
| 10 | Map | Mappls, red victim pins, green responder pins, deconfliction | Key restriction, PII-minimised popups, clustering at scale | BUILT | FE-04, FE-16 | 2 |
| 11 | Ongoing / Acceptors / History pages | Built; acceptors found by scanning subcollections | Collection-group query with `regionId`; detail drawer; pagination | BUILT | FE-05, FE-06, FE-07, FE-17 | 2 |
| 12 | Resolve flow | Public endpoint, atomic batch, user-only | Authorized, idempotent, audited, supervisor/admin close, false-alarm tag | REWORK | HF-01, BE-07 | 0, 2 |
| 13 | Cleanup | `setInterval` daemon, 24 h auto-archive; `POST /cleanup/events` any signed-in user | Scheduled jobs (OIDC-protected), STALE flag, escalation | REWORK | HF-03, BE-22 | 0, 2 |
| 14 | Region routing of SOS | Client `city` string | Server-derived geofence + fallback | MISSING | BE-16 | 2 |
| 15 | Acknowledgement / escalation | None | SLA timers, ladder, audible alert | MISSING | BE-17, FE-15 | 2 |
| 16 | Notifications | Only a `notified_to` array field | Delivery-tracked fan-out to supervisors + contacts | MISSING | BE-08 | 2–3 |
| 17 | Evidence | None | Encrypted, resumable, access-logged | MISSING | BE-09, M-04, FE-18 | 4 |
| 18 | Firestore rules | **Not present in documented repo tree** | Deployed, default-deny, negative-tested | MISSING | HF-05, BE-05 | 0–1 |
| 19 | Indexes | Markdown note + in-memory fallback | `firestore.indexes.json` deployed from CI | MISSING | BE-01 | 1 |
| 20 | Tests | One script `test-resolve-endpoint.js` | Unit/integration/rules/e2e/device/load | MISSING | BE-14, FE-13, QA-* | 0→6 |
| 21 | CI/CD | Frontend `vercel.json` only | PR checks, staging, gated prod | MISSING | OPS-03, OPS-05, OPS-07 | 0, 1, 6 |
| 22 | Observability, backup, runbooks | None | Logs, metrics, alerts, PITR + exports, restore drill | MISSING | BE-12, BE-13 | 2, 6 |
| 23 | Environments | One Firebase project `wana-9705e` used incl. test events | dev (emulators) / staging / prod, separate projects | REWORK | OPS-02 | 0 |
| 24 | Legacy routes | `/dashboard`, `/currentstatus` show **unfiltered** events | Removed | REWORK | HF-02 | 0 |
| 25 | MongoDB | Admin, Supervisor, SupervisorLog | Retired | REWORK | BE-20 | 1 |
| 26 | Mobile app | Not in this repo | Reliable manual SOS first, then autonomy | SPEC | M-01…M-11 | 3–5 |
| 27 | AI/Data | Not in this repo | Rule-based, explainable, shadow mode | SPEC | AI-01, AI-02, M-05…M-08 | 5 |

---

## 4. Critical findings

Findings 4.1 come from **comparing the codebase document's API/route tables with the audit's security model** [New]. Findings 4.2 are the audit's original eight [Audit]. All must be confirmed against the repo in Phase 0.

### 4.1 Codebase-derived findings
| ID | Severity | Finding | Why it matters | Fix |
|---|---|---|---|---|
| C-01 | **Critical** | `POST /events/resolve/:eventId` is **public** | Anyone who knows/guesses an event ID can resolve and archive a live SOS | HF-01 |
| C-02 | **Critical** | Legacy `/dashboard` and `/currentstatus` show an **unfiltered** ongoing-events table to any authenticated user | Cross-region data leak; also implies Firestore rules (if any) allow broad reads | HF-02, HF-05 |
| C-03 | **Critical** | No Firestore rules in the documented tree; `users` docs carry `role`, `region`, `isApproved` | If client-writable, any user can self-escalate; if rules are open, all events/PII are readable | HF-05, BE-05 |
| H-01 | High | `POST /cleanup/events` needs only `authMiddleware`; `GET /cleanup/status` is public | Any signed-in user can trigger bulk archival; operational info disclosure | HF-03 |
| H-02 | High | `GET /auth/status/:uid`, `GET /supervisor/status/:uid`, `POST /supervisor/register` are public and trust a caller-supplied UID/email | User enumeration; fake or squatted supervisor records | HF-04 |
| H-03 | High | Region is **client-declared** (supervisor picks a city; events carry a `city` string compared by equality) | Misrouted or hidden SOS; typo/case bugs ("Solapur" vs "solapur"); boundary travel | BE-16, BE-02 |
| H-04 | High | In-process daemon **auto-resolves any unresolved event after 24 h** | A real, unacknowledged SOS silently disappears; N instances ⇒ N daemons; unusable on serverless | BE-22, DD-14 |
| H-05 | High | No acknowledgement, escalation or real notification (only `notified_to` field) | If nobody is watching, nobody knows | BE-17, BE-08, FE-15 |
| H-06 | High | Admins skip email verification; seeded known addresses; no MFA; default credentials appear in docs | Highest-privilege accounts are the weakest | BE-21, HF-06 |
| H-07 | High | Region dropdown offers **Mumbai and Nagpur**, but admins are seeded only for **Solapur and Pune** | Supervisors choosing those cities wait in "pending" forever | HF-07 |
| M-01 | Medium | Dual source of truth (MongoDB + Firestore `users`) | State drift between approval status and access | BE-20 |
| M-02 | Medium | No tests, CI, monitoring or backups; one Firebase project holds test and real data | No safe way to change anything; test events pollute the live map | OPS-02/03, BE-12/13 |
| M-03 | Medium | Revocation is a MongoDB flag; Firebase ID tokens remain valid up to 1 hour | Revoked supervisor can keep reading events for up to an hour | BE-18 |
| M-04 | Medium | Responders discovered by scanning each `acceptedEvents/{id}/acceptors` | N+1 listeners; cost and latency grow with events | FE-17 |
| M-05 | Medium | Missing composite indexes are tolerated via in-memory fallback | Hides misconfiguration; does not scale | BE-01 |
| M-06 | Medium | Map SDK script/key lives in `index.html`; popups show victim email | Key abuse; unnecessary PII on screen | HF-06, FE-16 |
| M-07 | Low | README says Node 18+ (EOL); `package.json` lists Leaflet though Mappls is used | Tech debt, supply-chain surface | OPS-01 |

### 4.2 Audit findings (F1–F8) mapped to tickets
| ID | Finding | Resolution in this blueprint |
|---|---|---|
| F1 | Differentiator rests on weakest foundation (OS background limits) | Fix platform + device matrix first (DD-06); manual SOS before autonomy; phrase features "where the OS permits" — Phases 3, 5 |
| F2 | Who decides which region gets an SOS? | Server-side geo-routing — BE-16 |
| F3 | Authorization must live in rules + claims | BE-04, BE-05, BE-18 |
| F4 | Lifecycle too thin | Extended lifecycle §9 — BE-06/07/17 |
| F5 | What if nobody is watching? | SLA + escalation ladder — BE-17, FE-15 (DD-07) |
| F6 | SOS must survive backend failure | Direct create-only Firestore write + offline queue — BE-06, M-10 |
| F7 | Redundant identity machinery | Firebase ID tokens only — DD-04 |
| F8 | Intelligence needs a validation path | Rule-based, shadow mode, metrics — Phase 5 |

---

## 5. Product scope & actors

| Actor | Role | Surface | Notes |
|---|---|---|---|
| **User** | Triggers SOS; marks "I'm Safe"; owns own events; manages emergency contacts | Mobile app | Separate repo/stack — document it (DD-06) |
| **Community responder** [Code] | Accepts a nearby SOS and shares location | Mobile app → shown in console | Governance undefined (DD-15) |
| **Supervisor** | Monitors and acknowledges SOS in **one region**; closes with reason | Web console | Verified email + admin approval |
| **Regional admin** | **One per region.** Approves/rejects/suspends supervisors; audits region | Web console | MFA required |
| **Platform admin** [New] | Break-glass: bootstraps regions/admins, covers uncovered regions, recovers lost admins | Web console / scripts | DD-13; minimal count, MFA, fully audited |

**Non-goals for v1:** replacing local emergency services (state this in product messaging), consumer-facing web, any AI feature promoted to live alerts before shadow-mode validation.

---

## 6. Target architecture

```
                 CLIENT ZONE (untrusted)
   ┌───────────────────────┐        ┌────────────────────────────┐
   │ Mobile app            │        │ Web console (React 19/Vite)│
   │ SOS, GPS, sensors,    │        │ Supervisor + Admin, Mappls │
   │ evidence capture      │        │ Vercel                     │
   └──────┬────────────────┘        └──────┬──────────────┬──────┘
          │ create-only SOS,               │ realtime     │ REST (Bearer ID token)
          │ heartbeats (rules-validated)   │ listeners    │
          ▼                                ▼              ▼
   ┌─────────────────────────────────────────────┐   ┌──────────────────────────┐
   │ Firestore  (source of truth, rules-enforced)│   │ Backend API (Express)    │
   │ ongoingEvents · pastEvents · acceptedEvents │◄──┤ Cloud Run + Admin SDK    │
   │ staff · regions · auditLogs · notifications │   │ approvals, resolve, ack, │
   │ users · evidence                            │   │ audit, claims            │
   └───────┬─────────────────────────────────────┘   └──────────────────────────┘
           │ triggers                    ▲
           ▼                             │ scheduled
   ┌─────────────────────────┐   ┌───────┴────────────────┐   ┌──────────────────┐
   │ Cloud Functions (2nd gen)│   │ Cloud Scheduler        │   │ Evidence Storage │
   │ onCreate → geo-route,    │   │ ack/escalation, stale, │   │ (GCS, encrypted, │
   │ dispatch, notify         │   │ retention jobs         │   │ signed access)   │
   └───────┬─────────────────┘   └────────────────────────┘   └──────────────────┘
           ▼
   ┌─────────────────────────┐   ┌────────────────────────┐
   │ Notification providers  │   │ AI / Data services     │
   │ FCM, email, SMS/WhatsApp│   │ risk, follow, audio    │
   └─────────────────────────┘   │ (versioned, explainable)│
                                 └────────────────────────┘
   Firebase Auth: identity + email verification + MFA(admin); custom claims {role, regionId}
```

### 6.1 Final stack
| Layer | Technology | Note |
|---|---|---|
| Web | React 19, Vite 7, React Router 7, Bootstrap 5 / React-Bootstrap, Mappls Vector Map v3 | [Code] keep; remove unused Leaflet if confirmed unused |
| Auth | Firebase Auth (+ MFA for admins via Identity Platform or equivalent) | Claims `role`, `regionId` |
| Data | Cloud Firestore (**only database**) | MongoDB retired |
| API | Node (LTS, 24 tested) + Express 4.21, Joi validation | [Code] keep |
| Server SDK | firebase-admin 13 with Application Default Credentials on Cloud Run | No private-key env var in prod |
| Jobs/triggers | Cloud Functions 2nd gen (`onDocumentCreated`, `onSchedule`) + Cloud Scheduler | Replaces `setInterval` daemon |
| Notifications | FCM (web push to supervisors), email (Nodemailer or provider), SMS/WhatsApp for contacts | India SMS needs **DLT registration** — start early |
| Storage | Cloud Storage, CMEK optional, signed short-lived URLs | Phase 4 |
| Observability | pino structured logs, Cloud Logging/Monitoring, Sentry | |
| Testing | Vitest (web), Jest/Vitest + supertest (API), Firebase Emulator Suite + `@firebase/rules-unit-testing`, Playwright (e2e) | |
| CI/CD | GitHub Actions → Vercel (web), Cloud Run (API), Firebase CLI (rules, indexes, functions) | |

### 6.2 Environments [New] (OPS-02)
| Env | Firebase project | Data | Purpose |
|---|---|---|---|
| `dev` | Emulator Suite (local) | Seed scripts only | Daily development, rules tests |
| `staging` | Separate project (e.g. `wana-staging`) | Synthetic | Integration, drills, load tests |
| `prod` | Separate project (e.g. `wana-prod`) | Real | Treat existing `wana-9705e` as dev/staging; **do not mix test events into prod** |

Project names above are placeholders. Each environment has its own Firebase config, Mappls key (domain-restricted), service account, secrets and CORS allow-list.

### 6.3 Repository layout (extends the existing tree) [New]
```
wana/
├── backend/                 # Express API (existing)
│   └── src/{app.js, configuration, middleware, routes, services, models(legacy), scripts}
├── frontend/                # React app (existing)
├── functions/               # NEW: Cloud Functions (geo-route, dispatch, jobs)
├── firebase/                # NEW: firestore.rules, firestore.indexes.json, storage.rules, firebase.json
│   └── tests/               #      rules unit tests (emulator)
├── docs/                    # NEW: decisions/ (ADR per DD-xx), runbooks/, threat-model.md
├── scripts/                 # NEW: seed, sos-simulator, bootstrap-admin, migrate-mongo-to-firestore
├── .github/workflows/       # NEW: ci.yml, deploy-staging.yml, deploy-prod.yml
└── WANA_MASTER_BLUEPRINT.md
```

---

## 7. Data model (Firestore — final)

Region identifiers are **slugs** (`solapur`, `pune`, `mumbai`, `nagpur`) — never display names. Timestamps are server timestamps. All documents carry `schemaVersion`.

### 7.1 Collections
| Collection | Doc ID | Key fields | Written by | Read by |
|---|---|---|---|---|
| `regions` | `regionId` slug | `name`, `center{lat,lng}`, `zoom`, `adminUid`, `status`, `ackSlaSeconds`, `staleSeconds`, `fallbackRegionId` | Platform admin / backend | Any signed-in (non-sensitive fields only) |
| `regionGeo` | `regionId` | `polygon` (GeoJSON) or `radiusKm` interim | Platform admin | Backend only |
| `staff` | Firebase UID | `role` (admin\|supervisor), `name`, `email`, `regionId`, `status` (PENDING\|APPROVED\|REJECTED\|SUSPENDED), `approvedBy/At`, `rejectReason`, `claimsVersion`, `mfaEnrolled` | Backend only | Self; admin of same region |
| `users` | Firebase UID | `name`, `phone`, `fcmTokens`, `consent{…}`, `createdAt` — **no role/region/approval fields** | User (restricted keys) | User |
| `users/{uid}/contacts/{id}` | auto | `name`, `phone`, `channel`, `verified` | User | User; backend |
| `ongoingEvents` | **client-generated UUID** (= `event_id`, gives idempotency) | `event_id`, `sos_clicked_by_uid`, `sos_clicked_by_email`, `emergency_type`, `emergency_message`, `location` (GeoPoint), `city` (hint), `timestamp`, `is_resolved`, **`status`**, **`regionId`**, **`regionSource`**, `dispatchedAt`, `ackBy`, `ackAt`, `escalatedAt`, `lastHeartbeatAt`, `stale`, `notified_to[]`, `schemaVersion` | App (create-only + heartbeat); backend (all transitions) | Owner; staff of `regionId` |
| `acceptedEvents/{eventId}` + `/acceptors/{uid}` | UID | `name`, `email`, `acceptedAt`, `userLocation`, **`regionId`**, **`eventId`** | Backend (BE-23) | Staff of `regionId` via collection-group |
| `pastEvents` | same `eventId` | all ongoing fields + `resolvedAt`, `resolvedBy{uid,role}`, `resolution` (SAFE\|SUPERVISOR_CLOSED\|FALSE_ALARM\|CANCELLED\|STALE_CLOSED), `reason`, `retentionUntil`; sub-collection `acceptors` | Backend only | Owner; staff of `regionId` |
| `auditLogs` | auto (deterministic for idempotent actions) | `actor{uid,role,regionId}`, `action`, `target{type,id}`, `regionId`, `summary`, `requestId`, `ts` | Backend only, **append-only** | Admin of same region (read-only) |
| `notifications` | auto | `eventId`, `channel`, `target`, `status`, `attempts`, `lastError`, `ts` | Backend/functions | Staff of region; backend |
| `evidence` | auto | `eventId`, `ownerUid`, `storagePath`, `chunks`, `sha256`, `status`, `retentionUntil` | Backend/app (restricted) | Owner; staff by policy (logged) |
| `shared_trips`, `feedback` [Audit] | auto | Defined in Phase 5 | | |

### 7.2 Required indexes (commit to `firebase/firestore.indexes.json`)
- `ongoingEvents`: (`regionId` ASC, `status` ASC, `timestamp` DESC)
- `ongoingEvents`: (`status` ASC, `dispatchedAt` ASC) — escalation job
- `ongoingEvents`: (`status` ASC, `lastHeartbeatAt` ASC) — stale job
- `pastEvents`: (`regionId` ASC, `resolvedAt` DESC); (`regionId`, `sos_clicked_by_email`, `resolvedAt`)
- `auditLogs`: (`regionId` ASC, `ts` DESC); (`regionId`, `action`, `ts` DESC)
- Collection group `acceptors`: (`regionId` ASC, `acceptedAt` DESC)

The in-memory query fallback in the current code is **removed in prod builds** — a missing index must fail loudly in staging.

### 7.3 MongoDB → Firestore migration (BE-20)
1. Freeze schema changes. Export `Admin`, `Supervisor`, `SupervisorLog` (JSON).
2. Create `regions` (slugs) and `regionGeo` (interim radius around `regionCenters.js` coordinates).
3. Write `staff` docs from Admin + Supervisor; map `isApproved` → `status`; keep the one-admin-per-region invariant via `regions/{id}.adminUid` set in a transaction.
4. Issue custom claims (`role`, `regionId`) for every APPROVED staff member; revoke refresh tokens for everyone else.
5. Archive `SupervisorLog` to a JSON/CSV export in cold storage (optional backfill into `auditLogs`).
6. **Dual-run** one release: API reads Firestore, writes both; compare counts/diffs daily.
7. Cut over; Mongo becomes read-only; keep the backup for an agreed window, then decommission and delete `MONGO_URI` and Mongoose from the dependency tree.
8. Split the old `users` collection: staff → `staff`; mobile users stay in `users` (without privilege fields).

---

## 8. Access model

### 8.1 Roles and claims
Custom claims (≤ 1000 bytes) set by the Admin SDK at approval: `{ role: 'supervisor'|'admin', regionId: '<slug>' }`.
The Firestore rules **also** check `staff/{uid}.status == 'APPROVED'` so that **revocation takes effect in seconds, not up to an hour** (ID tokens live ~1 h; a rules `get()` costs one extra read per query evaluation — accepted trade-off). The web client listens to its own `staff/{uid}` doc and force-refreshes its token (`getIdToken(true)`) when `claimsVersion` changes.

### 8.2 Access matrix
| Capability | User | Supervisor | Admin | Backend |
|---|---|---|---|---|
| Create SOS | Own only | — | — | Validates/routes |
| Heartbeat/location update | Own, while unresolved | — | — | — |
| Read active events | Own | Own region | Own region | All |
| Acknowledge | — | Region events | Region events | Executes |
| Resolve ("I'm Safe") | Own | Close with reason | Close with reason | Transactional move |
| Cancel in grace window | Own | — | — | Executes |
| Read past events | Own | Own region | Own region | All |
| Read staff profiles | — | Self | Own region | All |
| Approve / reject / suspend supervisor | — | — | Yes (audited) | Executes + logs |
| Access evidence | Own | Region, active incidents only, logged | Region, logged | Pipeline only |
| Read audit logs | — | — | Own region, read-only | Write only |
| Edit region config | — | — | Audited edits | Executes + logs |
| Create regions / admins | — | — | — | Platform admin via script |

### 8.3 Supervisor approval state machine
| State | Meaning | Access | Transitions |
|---|---|---|---|
| UNVERIFIED | Account created, email unverified | None | → PENDING on verification |
| PENDING | Verified; region chosen (**only from regions with an active admin**); awaiting decision | Waiting screen | → APPROVED / REJECTED |
| APPROVED | Claims issued (`role`, `regionId`) | Region console | → SUSPENDED |
| REJECTED | Declined with reason; claims withheld | None | Re-apply per policy |
| SUSPENDED | Access revoked, account kept; claims removed and refresh tokens revoked | None | → APPROVED by admin |

Rules: region can be set **once**, only while PENDING; changing region is admin-only and audited. Every transition is atomic, writes an `auditLogs` entry, and (optionally) sends an email.

### 8.4 Firestore security rules — skeleton (BE-05 / HF-05)
Treat as a starting point; finalize with emulator tests (§16). Default is **deny**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function authed()   { return request.auth != null; }
    function role()     { return request.auth.token.get('role', ''); }
    function myRegion() { return request.auth.token.get('regionId', ''); }
    function isStaff()  { return authed() && role() in ['admin', 'supervisor']; }
    function staffOk()  { return isStaff() &&
        get(/databases/$(db)/documents/staff/$(request.auth.uid)).data.status == 'APPROVED'; }
    function sameRegion(d) { return staffOk() && d.regionId == myRegion(); }
    function isOwner(d)    { return authed() && d.sos_clicked_by_uid == request.auth.uid; }

    match /regions/{id}  { allow read: if authed(); allow write: if false; }
    match /regionGeo/{id} { allow read, write: if false; }

    match /staff/{uid} {
      allow read: if authed() && (request.auth.uid == uid || (role() == 'admin' && sameRegion(resource.data)));
      allow write: if false;                       // backend only
    }

    match /users/{uid} {
      allow read: if request.auth.uid == uid;
      allow create: if request.auth.uid == uid &&
        request.resource.data.keys().hasOnly(['name', 'phone', 'fcmTokens', 'consent', 'createdAt', 'schemaVersion']);
      allow update: if request.auth.uid == uid &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'phone', 'fcmTokens', 'consent']);
      allow delete: if false;
    }

    match /ongoingEvents/{eventId} {
      allow read: if isOwner(resource.data) || sameRegion(resource.data);

      allow create: if authed()
        && request.resource.data.keys().hasOnly(['event_id','sos_clicked_by_uid','sos_clicked_by_email',
             'emergency_type','emergency_message','location','city','timestamp','is_resolved',
             'status','notified_to','schemaVersion'])
        && request.resource.data.event_id == eventId
        && request.resource.data.sos_clicked_by_uid == request.auth.uid
        && request.resource.data.status == 'CREATED'
        && request.resource.data.is_resolved == false
        && request.resource.data.timestamp == request.time
        && request.resource.data.location is latlng
        && request.resource.data.emergency_type in ['SOS','Medical','Harassment','Assault']
        && request.resource.data.emergency_message.size() <= 500;

      allow update: if isOwner(resource.data) && resource.data.is_resolved == false
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['location','lastHeartbeatAt'])
        && request.resource.data.lastHeartbeatAt == request.time;

      allow delete: if false;                      // transitions are backend-only
    }

    match /pastEvents/{eventId} {
      allow read: if isOwner(resource.data) || sameRegion(resource.data);
      allow write: if false;
      match /acceptors/{uid} { allow read: if sameRegion(resource.data); allow write: if false; }
    }

    // Collection-group read for responders (staff, region-scoped)
    match /{path=**}/acceptors/{uid} {
      allow read: if sameRegion(resource.data) || request.auth.uid == uid;
      allow write: if false;                       // BE-23
    }

    match /auditLogs/{id} {
      allow read: if role() == 'admin' && sameRegion(resource.data);
      allow write: if false;
    }
    match /notifications/{id} { allow read: if sameRegion(resource.data); allow write: if false; }

    match /{document=**} { allow read, write: if false; }   // explicit default deny
  }
}
```
Notes: (1) a client-supplied `regionId`, `status` other than `CREATED`, `ackBy`, etc. is **rejected** at create; the backend trigger sets them. (2) Queries from the console **must** include `where('regionId','==',<claim>)` — rules do not filter results. (3) Create-only with a client-generated UUID doc ID makes retries idempotent: a retry hits "already exists", which the app treats as success after reading the doc.

---

## 9. SOS lifecycle

### 9.1 States
| State | Meaning | Entered by | Exits to |
|---|---|---|---|
| CREATED | Valid event written by the app; region not yet derived | App | DISPATCHED, CANCELLED |
| DISPATCHED | Region derived server-side; supervisors + contacts notified; delivery tracked | Function trigger | ACKNOWLEDGED, ESCALATED, RESOLVED |
| ACKNOWLEDGED | A supervisor took responsibility; first-response time stored | Supervisor | RESOLVED, ESCALATED |
| ESCALATED | No ack within SLA, or heartbeat lost, or supervisor un-acks; admin/fallback alerted | Scheduler | ACKNOWLEDGED, RESOLVED |
| CANCELLED | User cancelled inside the grace window; **retained and flagged, never deleted** | User | Archived |
| RESOLVED | User "I'm Safe", or supervisor/admin close with reason/false-alarm tag | User/Supervisor/Admin | Archived to `pastEvents` |

**STALE** (no heartbeat past threshold while unresolved) is implemented as a **boolean flag `stale`** that can coexist with any live state (so an acknowledged event does not lose its state). A stale event raises a console warning and escalates; it is **never auto-archived without a human decision** (DD-14).

### 9.2 Invariants
1. Every transition is atomic and writes an audit entry (deterministic audit ID where idempotency matters).
2. Retries never create duplicate incidents (UUID doc ID, create-only).
3. An unresolved event is never silently dropped by the UI or by a job; disconnection shows a stale-data banner (FE-11).
4. Notifications to emergency contacts do **not** depend on any supervisor being online.
5. Region is derived on the server from validated coordinates; the client value is a hint.

### 9.3 Starting parameters (placeholders — close in DD-07 / Phase 3)
| Parameter | Starting value |
|---|---|
| App heartbeat interval | 15–30 s while SOS active |
| Stale threshold | 120 s without heartbeat |
| Cancel grace window | 15 s |
| Acknowledgement SLA | 120 s → escalate to region admin; 300 s → fallback control room |
| SOS → visible in console (p95) | ≤ 5 s |
| Console reconnect resync | ≤ 10 s |

### 9.4 Server-side region routing (BE-16)
`onDocumentCreated('ongoingEvents/{id}')` →
1. Validate coordinates; point-in-polygon against `regionGeo` (Turf `booleanPointInPolygon`) — interim: radius around region center, then nearest center within a max distance.
2. Boundary overlap: pick region with the closest center; **notify both** regions' supervisors.
3. Uncovered area: set `regionId = 'unrouted'`; alert platform admin / fallback control room.
4. Write `regionId`, `regionSource` (`geofence`|`nearest`|`fallback`), `status = DISPATCHED`, `dispatchedAt`; start notification fan-out.
Region changes after the fact are admin-only and audited.

### 9.5 Closing an event — reference transaction (BE-07)
```js
// backend/src/services/eventLifecycle.js
async function closeEvent({ eventId, actor, resolution, reason }) {
  const ongoing  = db.doc(`ongoingEvents/${eventId}`);
  const past     = db.doc(`pastEvents/${eventId}`);
  const accepted = db.collection(`acceptedEvents/${eventId}/acceptors`);
  const audit    = db.collection('auditLogs').doc(`${eventId}:close`);   // deterministic ⇒ idempotent

  return db.runTransaction(async (tx) => {
    const [ev, pastSnap] = await Promise.all([tx.get(ongoing), tx.get(past)]);
    if (!ev.exists) {
      if (pastSnap.exists) return { result: 'ALREADY_RESOLVED' };     // retry-safe
      throw httpError(404, 'EVENT_NOT_FOUND');
    }
    const data = ev.data();
    assertCanClose(actor, data);        // owner | supervisor/admin whose regionId == data.regionId
    const acceptors = await tx.get(accepted);                          // all reads before writes

    tx.set(past, { ...data, is_resolved: true, status: 'RESOLVED', resolution, reason,
                   resolvedAt: FieldValue.serverTimestamp(),
                   resolvedBy: { uid: actor.uid, role: actor.role } });
    acceptors.forEach((a) => { tx.set(past.collection('acceptors').doc(a.id), a.data()); tx.delete(a.ref); });
    tx.delete(accepted.parent);          // acceptedEvents/{eventId}
    tx.delete(ongoing);
    tx.set(audit, { actor: pick(actor, ['uid','role','regionId']), action: 'EVENT_CLOSE',
                    target: { type: 'event', id: eventId }, regionId: data.regionId,
                    summary: { resolution, reason }, ts: FieldValue.serverTimestamp() });
    return { result: 'RESOLVED' };
  });
}
```
A transaction is limited to 500 writes; if an event could have more than ~200 responders, fall back to chunked batches that are re-runnable.

---

## 10. Backend API (target)

All routes except health require `Authorization: Bearer <Firebase ID token>`; the **UID always comes from the verified token**, never from the URL/body. All inputs validated with Joi; consistent error envelope `{ error: { code, message, requestId } }`.

| Method | Endpoint | Who | Purpose | Replaces / change |
|---|---|---|---|---|
| GET | `/healthz`, `/readyz` | Public (minimal body) | Liveness / readiness | `GET /cleanup/status` removed |
| GET | `/auth/me` | Any signed-in | `{ role, status, regionId, email }` | Replaces public `/auth/status/:uid` (HF-04) |
| POST | `/supervisor/register` | Signed-in (token UID/email) | Create PENDING-ready staff record, idempotent | Was public (HF-04) |
| PATCH | `/supervisor/region` | Supervisor, PENDING, region empty | Set region once (only regions with an active admin) | Was `/supervisor/complete-profile` (alias kept briefly) |
| GET | `/supervisor/profile` | Supervisor | Own profile | Same |
| GET | `/admin/supervisors?status=` | Admin | List by status (PENDING/APPROVED/REJECTED/SUSPENDED), paginated | Replaces `/pending` + `/approved` |
| POST | `/admin/supervisors/:uid/approve` | Admin (region) | Approve, set claims, audit, email | Was `PATCH …/:id/approve` |
| POST | `/admin/supervisors/:uid/reject` | Admin | Reject with reason | New |
| POST | `/admin/supervisors/:uid/suspend` · `/reinstate` | Admin | Suspend (claims removed, tokens revoked) / reinstate | Replaces "revoke" |
| GET | `/admin/audit-logs` | Admin | Region audit, filters + cursor | Replaces `/logs/region` |
| GET | `/admin/dashboard/summary` | Admin | Counts: supervisors, active SOS, response times | New (FE-08) |
| POST | `/audit/session` | Supervisor | `login`/`logout`/`action` entries | Replaces `/logs/create` |
| POST | `/events/:eventId/ack` | Supervisor (region) | Acknowledge; stores first-response time | New |
| POST | `/events/:eventId/resolve` | Owner / Supervisor / Admin | Close with `resolution` + `reason` | Replaces public `/events/resolve/:eventId` (old path alias, authenticated, removed in Phase 2) |
| POST | `/events/:eventId/cancel` | Owner | Cancel inside grace window | New |
| POST | `/events/:eventId/accept` | Responder | Register as responder | New (BE-23) |
| POST | `/internal/jobs/{escalation,stale,retention}` | **Scheduler service account (OIDC) only** | Run housekeeping | Replaces `setInterval` daemon and `/cleanup/events` |

Cross-cutting (BE-11): `helmet`, CORS allow-list per environment, `express-rate-limit` (stricter on auth/registration), request IDs, `pino-http`, central error handler, body-size limits, graceful shutdown, no stack traces to clients.

---

## 11. Web frontend spec

### 11.1 Routes (target)
| Path | Component | Access | Notes |
|---|---|---|---|
| `/home`, `/login`, `/register` | Home / Login / Signup | Public | Password-strength indicator [Code] |
| `/verify-email` | New | Authed, unverified | Resend with cooldown |
| `/complete-profile` | CompleteProfile | Supervisor, no region | Only regions with an active admin |
| `/pending-approval`, `/rejected`, `/suspended` | Waiting/denied screens | Matching state | FE-02 |
| `/supervisor/dashboard` | Command Center | Approved supervisor | Map + live tables + connection banner |
| `/supervisor/events/:id` | Incident drawer/page | Approved supervisor | FE-05: location, type, message, notification + ack state, responders |
| `/supervisor/ongoing-events`, `/acceptors`, `/history` | Tables | Approved supervisor | Pagination, filters, PII-minimised |
| `/admin/dashboard` | Admin dashboard | Admin | FE-08 |
| `/admin/approval`, `/admin/logs` | Approvals, audit | Admin | + reject/suspend |
| `/admin/region` | Region settings | Admin | SLA/stale values, audited (FE-19) |
| `/logout` | Logout confirmation | Authed | |
| ~~`/dashboard`, `/currentstatus`~~ | **Delete** (HF-02) | — | Unfiltered legacy views |

### 11.2 Behaviours that must exist
- **Connection state (FE-11):** use snapshot `metadata.fromCache` + `navigator.onLine` to show Live / Reconnecting / **Stale data** banner; reconnect resyncs.
- **New-SOS alerting (FE-15):** audible + visual cue and an Acknowledge button. Browsers block audio without a user gesture, so require an **"Enable alerts" click at session start** and show a persistent warning if disabled/muted. Optional web push (FCM) when the tab is in the background.
- **PII minimisation (FE-16):** masked email/phone by default with reveal-and-log; idle lock; no victim email in map popups; no sensitive data in URLs or console logs.
- **Region-scoped queries:** every Firestore query includes `regionId` from claims.
- **Map (FE-04):** keep Mappls; keep proximity-deconfliction (~22 m); cluster dense areas; pin colours + shapes (not colour alone) for accessibility.
- **Double-submit safety (FE-09):** disable buttons during requests; backend idempotent.
- **Error/empty/loading states everywhere (FE-12).**

---

## 12. Mobile & AI workstreams (the differentiator)

The mobile app is **outside this repo** — create a repo, record its stack/min-OS/devices (DD-06), and treat all features as SPEC until device-proven. Sequence by waves:

| WP | Wave | Build | Exit criterion |
|---|---|---|---|
| M-01 Reliable manual SOS | 1 | Trigger → GPS → create-only event write → contact notification → ack visible | Supervisor sees event within target latency on the P0 device matrix |
| M-02 Background location | 1 | Permission flow, background tracking, battery policy, reconnect | Location continues with screen off / backgrounded / after reconnect |
| M-03 Silent triggers | 1 | Per-device feasibility, debounce, false-trigger cancel | Works on supported devices; false-trigger rate within agreed limit |
| M-09 Emergency contacts & consent | 1 | Contact CRUD, verification, consent records | Contacts notified independently of supervisors |
| M-04 Evidence mode | 2 | Camera/mic capture, chunked upload, local buffering | Upload resumes after network loss and app kill |
| M-10 Offline queue + idempotent retry | 2 | Persisted queue, exponential backoff, same UUID on retry | No duplicate/lost events under flaky network |
| M-11 Watchdog/recovery | 2 | Detect killed service, restore SOS state | State recovered after kill/reboot |
| M-05 Risk engine | 3 | Geospatial score from approved sources | Explainable, versioned, fresh |
| M-06 Follow detection | 3 | Movement-pattern thresholds | Precision/recall + battery budget met **in shadow mode** |
| M-07 Night/audio intelligence | 4 | Guard mode; keyword/scream where OS permits | Consent flow + on-device policy signed off |
| M-08 Safe-route / trip engine | 4 | Route baseline, deviation, stop/isolation | Tuned on recorded trips |

(Wave numbers here are ordering within the mobile track; see §14 for the phase each lands in.)

### 12.1 AI/Data operating rules [Audit]
- **No source, no feature:** document every data source (owner, licence, freshness, coverage) first — AI-01.
- Define metrics per detector (precision, recall, false-alarm rate, latency, battery) and acceptance thresholds before building.
- **Rule-based and explainable first; shadow mode** (log, don't alert) → promote only after thresholds are met on drill/pilot data.
- Version models and inputs; log each decision with inputs + confidence (BE-15).
- Process audio/camera **on-device** where possible; collect the minimum; delete on schedule.
- Never label a heuristic or model "production-ready" before validation.
- **Legal gate:** *Safe Stranger Verification* and *Emergency Fake-Shutdown* are Very-High-risk: no design work before legal/policy review (LEGAL-01).

### 12.2 Feature priority & risk (from audit)
| Feature | Pri | Risk | Phase |
|---|---|---|---|
| Silent SOS triggers | P0 | High | 3 |
| Evidence auto-recording | P0 | High | 4 |
| Night Smart Guard | P0 | High | 5 |
| Smart follow detection | P0 | High | 5 |
| Safety heatmap | P0 | Medium | 5 |
| Emergency fake-shutdown | P0 | **Very high** | Only after legal review; likely not v1 |
| Safe route companion | P1 | Medium | 5 |
| Taxi/auto monitoring | P1 | Medium | 5 |
| Crowd density score | P1 | Medium | 5 |
| Safe stranger verification | P2 | **Very high** | Only after privacy/legal review |

Product priority is not build order: P0 features that depend on the foundation (event model, identity, location contract, escalation) are built **after** it.

---

## 13. Roadmap overview

### 13.1 Phase ↔ milestone ↔ audit phase mapping
| This blueprint | Milestone | Audit phase(s) |
|---|---|---|
| 0 Stabilize & Freeze | — | 0 Foundation (+ hotfix [New]) |
| 1 Secure Core | M1 | 1 Secure Core |
| 2 Control Room & Event Backbone | M2 | 2 Web Operations (+ lifecycle/escalation) |
| 3 Mobile Reliability & Complete SOS | M3 | 3 Mobile Reliability (excl. evidence) |
| 4 Evidence & Resilience | M4 | 3 (evidence) + 5 Resilience |
| 5 Preventive Intelligence | M5 | 4 Intelligence |
| 6 Production Hardening | M6 | 6 Production Hardening |
| 7 Pilot & Launch | Go-live | 7 Pilot |

### 13.2 Track leadership by milestone
| Track | M1 | M2 | M3 | M4 | M5 | M6 |
|---|---|---|---|---|---|---|
| Backend / Security | **Lead** | Support | **Lead** | Support | **Lead**(contracts) | Support |
| Web frontend | Support | **Lead** | Support | Support | — | Support |
| Mobile | — | Support | **Lead** | **Lead** | **Lead** | Support |
| AI / Data | Prep | Prep | Prep | Prep | **Lead** | Support |
| DevOps / QA | Support | Support | Support | Support | Support | **Lead** |

No calendar dates are given on purpose: leads estimate durations at the end of Phase 0 once decisions are closed.

### 13.3 Critical path
1. Hotfix + environment split → 2. Schema/region/role model freeze → 3. Claims + approval state machine → 4. Rules + negative tests → 5. SOS ingestion (idempotent) + geo-routing → 6. Live console verification (test client → Firestore → console) → 7. Ack + escalation + notification + resolution + audit → 8. Manual SOS + background location on target devices → 9. Evidence pipeline → 10. Intelligence (shadow → live) → 11. Hardening, load + recovery drills → 12. Pilot.

**Parallel-safe now:** frontend work against emulators + mock events; AI data-source register + evaluation design; CI/staging setup; threat-model workshop; DPIA drafting. **Do not start advanced AI** until event model, identity, location contract and escalation contract are stable.

---

## 14. Phase-by-phase build plan

Each phase lists tickets, an **exit gate that must be demonstrated, not asserted**, and a demo. Track = FE / BE / MOB / AI / QA / OPS / SEC.

### Phase 0 — Stabilize & Freeze
**Goal:** stop the leaks, separate environments, record decisions, make the repo safe to change.

| ID | Task | Pri | Track | Acceptance |
|---|---|---|---|---|
| HF-01 | Lock `POST /events/resolve/:eventId`: require token; allow only owner, or supervisor/admin whose region matches the event; ignore caller UID | P0 | BE | Unauthenticated → 401; wrong user/region → 403 (tests) |
| HF-02 | Delete or guard `/dashboard` and `/currentstatus` (unfiltered events) | P0 | FE | Routes gone; no component queries `ongoingEvents` without region filter |
| HF-03 | `/cleanup/events` admin/service-only (or disabled); remove public `/cleanup/status` | P0 | BE | Only scheduler/platform admin can trigger |
| HF-04 | Auth + token-derived UID on `/auth/status`, `/supervisor/status`, `/supervisor/register`; add `/auth/me` | P0 | BE | Caller cannot query/register another UID |
| HF-05 | Deploy **baseline** Firestore rules (default deny, region-scoped event reads, `users` privilege fields not client-writable) to every env | P0 | BE/SEC | Emulator tests: unauth read denied, cross-region read denied, self-escalation denied |
| HF-06 | Secrets & edge hygiene: confirm `.env`/keys never committed (rotate if ever pushed); remove default admin passwords/test creds from docs and seeds; restrict Mappls + Firebase web keys by domain; CORS allow-list; `helmet`; basic rate limit | P0 | SEC/BE | Secret scan clean; keys restricted; CORS tested |
| HF-07 | Region dropdown lists only regions with an active admin; seed or hide Mumbai/Nagpur | P0 | BE/FE | A supervisor can never enter an un-approvable region |
| OPS-01 | Repo hygiene: branch protection, PR template, CODEOWNERS, ESLint/Prettier, `.nvmrc` + `engines`, remove unused deps (Leaflet if unused), fix README prerequisites | P0 | OPS | PR requires review + green checks |
| OPS-02 | Split envs: emulators (dev), staging project, prod project; per-env config; no test events in prod | P0 | OPS | Staging and prod deploy independently |
| OPS-03 | CI on PR: install, lint, build (web + API), rules tests when present, secret scan | P0 | OPS | Red build blocks merge |
| OPS-04 | Emulator Suite + seed script + `QA` SOS simulator stub | P1 | OPS/QA | `npm run dev:emu` boots Auth/Firestore with seed regions/users/events |
| SEC-01 | Threat-model workshop (account takeover, cross-region, injection, evidence leakage, abusive supervisor, insider, stalking, secrets) → `docs/threat-model.md` | P0 | SEC | Document reviewed by all leads |
| AI-01 | Data-source register + evaluation metric definitions (no modelling yet) | P1 | AI | Reviewed register |
| DD-* | Close and record decisions DD-01, 04, 06, 11, 12, 13, 14, 16, 17 as ADRs in `docs/decisions/` | P0 | Lead | ADRs merged |

**Exit gate**
- [ ] No unauthenticated state-changing endpoint remains (only `/healthz`, `/readyz`).
- [ ] Baseline rules deployed to all envs; emulator negative tests pass in CI.
- [ ] Legacy unfiltered routes are gone.
- [ ] dev / staging / prod separated; test data out of prod.
- [ ] ADRs recorded; owners and estimates assigned for Phases 1–2.
**Demo:** try resolving an event unauthenticated (fails), read another region's events as a supervisor (fails), show CI blocking a red PR.

---

### Phase 1 — Secure Core → **M1 Secure Skeleton**
**Goal:** identity and authorization are trustworthy; MongoDB is gone.

| ID | Task | Pri | Track | Acceptance |
|---|---|---|---|---|
| BE-01 | Formalize schemas (§7) with Joi/validators + `firestore.indexes.json` + deploy from CI; remove in-memory fallback in prod | P0 | BE | Schema + emulator tests; missing index fails in staging |
| BE-02 | Region registry (`regions`, `regionGeo`) + **secure admin bootstrap** + one-admin-per-region invariant in a transaction | P0 | BE | Admin cannot be self-created; duplicate region admin rejected (negative test) |
| BE-03 | Supervisor state machine: UNVERIFIED→PENDING→APPROVED/REJECTED/SUSPENDED; region set once | P0 | BE | State-machine tests; every transition atomic + audited |
| BE-04 | RBAC middleware (role + region from verified token + `staff` status) | P0 | BE | Authz suite: supervisor cannot touch other region/admin routes |
| BE-05 | Full Firestore rules (§8.4) + unit tests | P0 | BE/SEC | Rules tests in CI prove cross-region and escalation denial |
| BE-18 | Custom claims on approval; remove + `revokeRefreshTokens` on reject/suspend; `claimsVersion` bump | P0 | BE | Revoked user loses Firestore access within seconds (test) |
| BE-10 | Append-only `auditLogs` for all privileged actions + login/logout | P0 | BE | Log-completeness test; no client write path |
| BE-20 | MongoDB → Firestore migration (§7.3), dual-run, cutover, decommission | P0 | BE | Counts match; Mongo removed from code/deps |
| BE-21 | Admin MFA + one-time bootstrap script (forced password set); admin accounts verified | P0 | BE/SEC | Admin cannot sign in without MFA; no default creds anywhere |
| BE-11a | API hardening baseline: Joi on every route, error envelope, request IDs, structured logs | P0 | BE | Fuzz-lite tests on inputs |
| FE-01 | Role-aware navigation + guards (convenience; server enforces) | P0 | FE | Role-matrix tests |
| FE-02 | Screens for unverified / pending / rejected / suspended / approved / admin | P0 | FE | e2e per state |
| FE-09 | Approval UI: approve / reject (reason) / suspend / reinstate, confirmations, double-submit safe | P0 | FE | e2e + negative auth test |
| FE-13a | Frontend test harness (Vitest + Playwright) wired into CI | P0 | FE | CI gate |
| FE-14 | Env-based build config (Firebase, API URL, Mappls key) | P0 | FE | Staging deploy |
| OPS-05 | Staging deploy pipeline: web, API, rules, indexes | P0 | OPS | Merge to `main` ⇒ staging |
| QA-01 | SOS simulator CLI (creates valid events into emulator/staging) | P0 | QA | Used by FE for live testing |

**Exit gate**
- [ ] Admin creates/approves a supervisor; supervisor sees only their region.
- [ ] Rejected/suspended users lose access quickly; token refresh forced.
- [ ] Cross-region read **denied** by rules and API (automated).
- [ ] MongoDB retired; single source of truth.
- [ ] Admin MFA enforced; no default credentials.
**Demo (M1):** admin approves → supervisor gains access; admin suspends → access lost; cross-region read fails.

---

### Phase 2 — Control Room & Event Backbone → **M2 Live Control Room**
**Goal:** a simulated SOS appears live in the right region, can be acknowledged, escalated and resolved, end to end.

| ID | Task | Pri | Track | Acceptance |
|---|---|---|---|---|
| BE-06 | SOS ingestion: create-only validated write, UUID idempotency, trigger sets `regionId`/`status` | P0 | BE | Replay/duplicate tests: no duplicates |
| BE-16 | Region geo-routing (polygon/radius, boundary + uncovered rules) | P0 | BE | Geo-boundary tests |
| BE-07 | `closeEvent` transaction (§9.5): owner/supervisor/admin close, reasons, false-alarm tag | P0 | BE | Fault-injection: crash mid-transition recovers |
| BE-17 | Acknowledgement + escalation timers (Cloud Scheduler job) | P0 | BE | Timer simulation: no-ack → ESCALATED + audit |
| BE-22 | Replace `setInterval` daemon + 24 h auto-archive with scheduled jobs; **STALE flag** + escalation; OIDC-protected `/internal/jobs/*` | P0 | BE | No silent archival; multi-instance safe |
| BE-08a | Notification service v1: supervisors (FCM web push + email), delivery tracking, retry | P0 | BE | Delivery status visible; failure test |
| BE-12a | Basic observability: structured logs, error tracking, SOS-pipeline latency metric, uptime check | P1 | OPS | Alert fires in staging drill |
| FE-03 | Supervisor home + region summary | P1 | FE | Empty/error states |
| FE-04 | Live incident map on `regionId`, region-scoped, clustering | P0 | FE | Emulator realtime test |
| FE-05 | Incident detail drawer/page (+ ack state, responders) | P0 | FE | Component + snapshot |
| FE-06 | Current-status table: unresolved only, filters, pagination | P0 | FE | Integration test |
| FE-07 | History: search/filter, pagination (`pastEvents`) | P1 | FE | Integration test |
| FE-08 | Admin dashboard: region, supervisor, active SOS counts | P1 | FE | Data-consistency test |
| FE-10 | Admin region monitoring | P1 | FE | Integration test |
| FE-11 | Live/Reconnecting/**Stale** banner; resync on reconnect | P0 | FE | Network-drop test |
| FE-15 | New-SOS audible/visual alert + **Acknowledge** (starts SLA clock) | P0 | FE | Multi-session e2e |
| FE-16 | Session security + PII minimisation (idle lock, masked fields) | P1 | FE | Review + e2e |
| FE-17 | Move to `regionId` queries; acceptors via collection-group; remove per-event scanning | P0 | FE | Listener count stays flat as events grow |
| FE-19 | Admin region settings (SLA/stale values), audited | P1 | FE | Audit entry on change |
| QA-02 | E2E drill in CI: simulator SOS → console → ack → resolve → audit | P0 | QA | Green against staging |

**Exit gate**
- [ ] Simulated SOS appears live in the correct region within the agreed latency.
- [ ] Wrong-region supervisors never see it; boundary and uncovered cases handled.
- [ ] No-ack event escalates automatically; stale event warns and escalates but is **not** auto-archived.
- [ ] Duplicate/retried writes create exactly one incident.
- [ ] Console visibly shows disconnection; reconnect resyncs.
**Demo (M2):** simulator creates SOS → supervisor sees/acks it live; second supervisor session sees ack; unacked event escalates to admin; resolve → appears in History.

---

### Phase 3 — Mobile Reliability & Complete SOS → **M3 Complete SOS**
**Goal:** a real phone raises a real SOS; supervisors **and** contacts are notified; the loop closes with audit.

| ID | Task | Pri | Track | Acceptance |
|---|---|---|---|---|
| DD-06/07 | Close mobile platform/device scope and escalation policy (SLA, ladder, relation to emergency services) | P0 | Lead | ADRs signed |
| M-01 | Reliable manual SOS | P0 | MOB | Visible in console within target on P0 device matrix |
| M-02 | Background location + battery policy | P0 | MOB | Location survives screen-off/background/reconnect |
| M-03 | Silent triggers (per-device feasibility) | P0 | MOB | Works on supported devices; false-trigger rate in limit |
| M-09 | Emergency contacts + consent records | P0 | MOB | Contacts notified independent of supervisors |
| BE-08b | Notification v2: emergency contacts (SMS/WhatsApp/call per provider), delivery tracking, retries, failure handling | P0 | BE | Failure-injection tests; SMS DLT in place for India |
| BE-23 | Responder (acceptor) flow: `POST /events/:id/accept`, `regionId` denormalized, rules; vetting/visibility per DD-15 | P1 | BE | Responder data visible only to region staff |
| BE-19a | Consent records + minimal privacy ops | P1 | BE | Consent stored/auditable |
| QA-03 | Device matrix (OEM × OS × battery states × network) and scripts | P0 | QA | P0 scenarios pass |
| QA-02b | Full incident drill: trigger → notify → ack → resolve → audit, repeatable | P0 | QA | Passes repeatedly |

**Exit gate**
- [ ] P0 device-matrix scenarios pass (background, screen-off, low battery, call interruption).
- [ ] Contacts notified without any supervisor action.
- [ ] End-to-end drill passes repeatedly with audit trail.
**Demo (M3):** real device → SOS → console + contact SMS → ack → resolve → audit trail.

---

### Phase 4 — Evidence & Resilience → **M4 Evidence**
**Goal:** evidence is captured, stored and accessed safely; critical flows survive network/app failure.

| ID | Task | Pri | Track | Acceptance |
|---|---|---|---|---|
| LEGAL-01 | DPIA + legal review of recording/consent/retention (**before** any recording is collected); DD-08 evidence policy | P0 | Lead/Legal | Signed-off policy |
| M-04 | Evidence mode: capture, chunk, local buffer, upload | P0 | MOB | Resumes after network loss and app kill |
| BE-09 | Evidence pipeline: encrypted, resumable upload, signed short-lived access, retention jobs, chain-of-custody log | P0 | BE | Interruption + access-control tests |
| FE-18 | Evidence viewer: need-to-know, every access logged | P1 | FE | Access appears in `auditLogs` |
| M-10 | Offline queue + idempotent retry | P0 | MOB | No lost/duplicate events in flaky network |
| M-11 | Watchdog/recovery after kill/reboot | P0 | MOB | State restored |
| BE-19b | Privacy ops: user data export/deletion, retention schedules | P1 | BE | Policy walkthrough passes |
| QA-05 | Recovery tests: crash mid-upload, partial transition, service restart | P0 | QA | No lost critical event/evidence state |

**Exit gate**
- [ ] Evidence survives interruption and is auditable end to end.
- [ ] Access is least-privilege and logged; retention jobs run.
- [ ] No silent loss under disconnect/reconnect.
**Demo (M4):** record → kill network/app → resume → supervisor views evidence → access appears in audit log.

---

### Phase 5 — Preventive Intelligence → **M5 Preventive Safety**
**Goal:** add prevention without destabilising the core — **shadow mode first**.

| ID | Task | Pri | Track | Acceptance |
|---|---|---|---|---|
| AI-02 | Shadow-mode framework: log decisions with inputs, confidence, model version; offline evaluation harness | P0 | AI | Metrics reproducible |
| M-05 / BE-15 | Risk engine (rule-based, explainable) + versioned service contracts | P1 | AI/BE | Score with documented sources, freshness, version |
| M-06 | Follow detection | P0 | MOB/AI | Precision/recall + battery budget in shadow mode |
| M-07 | Night/audio intelligence (consent, on-device) | P0 | MOB | Consent + device validation signed off |
| M-08 | Safe-route / trip engine | P1 | MOB | Tuned on recorded trips |
| FE-20 (opt.) | Risk overlay in console | P2 | FE | Region-scoped, explainable |
| LEGAL-02 | Review before any design on *Stranger Verification* / *Fake-Shutdown* | P0 | Lead | Written decision |

**Exit gate**
- [ ] Each live detector meets agreed precision/recall and battery budget; all others stay in shadow mode.
- [ ] Every alert is explainable and traceable to a model version.
- [ ] Core SOS metrics unchanged (no regression).
**Demo (M5):** replay recorded trip → risk warning with explanation; shadow-mode report per detector.

---

### Phase 6 — Production Hardening → **M6 Production Candidate**
| ID | Task | Pri | Track | Acceptance |
|---|---|---|---|---|
| BE-11 | Full hardening: dependency scanning, secret management, rate limits, App Check/attestation, WAF/Cloud Armor if exposed | P0 | BE/SEC | Security scan + pen test clean of critical |
| BE-12 | Observability: dashboards, SLOs, alerts (pipeline latency, failed notifications, escalations, function errors, budget) | P1 | OPS | Alert drill |
| BE-13 | Backups: Firestore PITR + scheduled exports; restore drill | P1 | OPS | Restore drill passes |
| BE-14 / FE-13 | Complete test suites (unit, integration, rules, e2e) as CI gates | P0 | All | Gates enforced |
| FE-12 | Accessibility + responsive audit | P1 | FE | Audit passed |
| OPS-06 | Runbooks: outage, notification-provider failure, region-routing error, stuck escalation, key rotation, data-breach response; on-call rota | P0 | OPS | Runbooks exercised in a drill |
| OPS-07 | Prod pipeline: manual approval, canary/rollback, migration safety | P0 | OPS | Rollback rehearsed |
| QA-04 | Load test: concurrent SOS × supervisor dashboards (watch listener/read cost) | P0 | QA | Targets met |
| SEC-02 | External/independent penetration test + remediation | P0 | SEC | No open critical/high |

**Exit gate (M6 go/no-go):** see §21.

---

### Phase 7 — Pilot & Launch
- **Scope:** one region (a seeded one, e.g. Solapur or Pune), trained supervisors and admin, incident drills, feedback loop.
- **Activities:** weekly drills; false-positive review; model/threshold tuning; supervisor training; support/escalation contacts published; communication that WANA **complements** emergency services.
- **Exit:** pilot KPIs met (§19.2) for an agreed period, zero open P0, known P1s owned. Then region-by-region rollout using the same checklist.

---

## 15. Security, privacy & threat model

### 15.1 P0 principles
1. Never rely on React guards alone; enforce at **Firestore rules + backend**.
2. Region is assigned **server-side**, changed only by admins, always audited.
3. Define evidence retention/deletion/access **before** collecting any recording.
4. Encrypt in transit and at rest; least-privilege service accounts; **no client secrets**; prefer ADC over key files.
5. Log privileged actions: approvals, rejections, suspensions, event access, evidence access, status changes, region/config edits.
6. Design for false positives: thresholds, cancellation, recovery.
7. Show supervisors only what they need; mask PII by default.
8. Admin/platform-admin accounts: MFA, minimal count, break-glass procedure.

### 15.2 Threat model starter
| Threat | Scenario | Mitigations | Verification |
|---|---|---|---|
| Account takeover | Supervisor/admin hijacked | Verified email, **admin MFA**, short-lived tokens, forced revocation, anomaly alerts | Auth abuse + revocation tests |
| Unauthorized region access | Supervisor reads another region | Claims + rules + region-scoped queries + server-derived region | Cross-region negative tests (rules + API) |
| Malicious event injection | Forged/flooded SOS | Create-only validated writes, **App Check**, rate limits, UUID idempotency, anomaly flags | Fuzz + flood tests |
| Evidence leakage | Weak access/links | Encryption, signed short-lived URLs, access logging, retention jobs | Access-control tests, log review |
| Abusive supervisor access | Views events without need | Need-to-know scoping, access logging, periodic audit, suspension flow | Audit-completeness test |
| Insider/admin misuse | Improper approvals/region edits | Immutable audit log, dual-control for sensitive config, alerting | Audit review drill |
| Location stalking via compromised device | Sharing abused | Explicit consent, visible indicators, easy revoke, trusted-contact controls | Abuse-case review |
| Secret/dependency compromise | Leaked key / vulnerable package | Secret manager, scanning, rotation, least privilege | CI scans, rotation drill |
| Public endpoint abuse [New] | Unauthenticated calls (see C-01, H-01, H-02) | No public state-changing routes; rate limits | Endpoint inventory test in CI |
| Region spoofing [New] | Client lies about location/region | Server derivation; plausibility checks | Routing tests |

### 15.3 Privacy & legal note
WANA processes live location, audio, video and personal contacts. Before recording or camera/audio features: complete a **data-protection impact assessment** under the laws that apply (India's DPDP Act 2023 and its Rules, GDPR if relevant — confirm applicable obligations and timelines with counsel), define consent and retention, and get legal review of recording and fake-shutdown behaviour. *This is a planning prompt, not legal advice.* Also confirm telecom rules for SMS (DLT) and any call/recording consent requirements.

---

## 16. Testing & acceptance

| Layer | Minimum coverage | Release gate | Owner |
|---|---|---|---|
| Unit | State transitions, validators, geo-routing, trigger debouncing, risk calcs | Critical logic covered or formally justified | Dev |
| Rules | **Every rule has an allow and a deny test** (cross-region, escalation, forged fields, direct Firestore access) | Zero critical authz failures | Security |
| Integration | Auth→role, SOS→Firestore→console, approval→access, resolve→history | All P0 flows pass | BE + FE |
| Realtime | Multiple supervisors, disconnect/reconnect, duplicate events, stale listeners | No silent loss of active SOS | FE + QA |
| E2E | Playwright per auth state and per role; drill script | Green on staging | QA |
| Mobile device | Background, permissions, screen state, battery, GPS, network loss, call interruption | Supported-device matrix passes | Mobile + QA |
| Load | Concurrent SOS + many dashboards (listener count, read cost) | Latency/error/cost targets met | DevOps |
| Recovery | Crash mid-upload, network loss, partial transition, restart | No lost critical state | BE + DevOps |
| Endpoint inventory | Script lists all routes; fails CI if any state-changing route lacks auth middleware | Zero unauthenticated writers | BE |
| Pilot drills | Trigger → supervisor resolution | Passes repeatedly | Lead + QA |

---

## 17. DevOps, operations & cost

### 17.1 CI/CD
- **PR:** lint → unit → API integration (supertest) → **rules tests in Emulator** → web build → secret scan (gitleaks) + `npm audit` → e2e on emulator (Playwright, nightly if slow).
- **`main` → staging:** deploy web (Vercel preview/staging), API (Cloud Run), functions, rules, indexes; run drill (QA-02).
- **Tag → prod:** manual approval, deploy rules/indexes **before** code that needs them, canary + rollback, post-deploy smoke test.
- Migrations are forward-compatible (expand → migrate → contract).

Sample PR workflow (extend per repo):
```yaml
name: ci
on: [pull_request]
jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm, cache-dependency-path: backend/package-lock.json }
      - run: npm ci && npm run lint && npm test
        working-directory: backend
  rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 21 }
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
        working-directory: firebase/tests
      - run: npx firebase-tools emulators:exec --only firestore,auth "npm test"
        working-directory: firebase
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci && npm run lint && npm test -- --run && npm run build
        working-directory: frontend
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
```

### 17.2 Observability
- **Logs:** pino JSON with `requestId`, `uid`, `regionId`, `eventId`; no PII payloads.
- **Metrics/alerts:** SOS→visible latency; ack time; escalations count; stale events; failed/late notifications; function error rate; listener count/Firestore reads; API 5xx/latency; uptime checks; budget alerts.
- **Error tracking:** Sentry (web + API + functions).
- **Dashboards:** one "control room health" board used during pilot.

### 17.3 Backup & recovery
Firestore **point-in-time recovery** + scheduled exports to GCS (versioned); evidence bucket versioning + retention policy; quarterly **restore drill**; documented RPO/RTO.

### 17.4 Cost controls
Realtime cost grows with *supervisors × events*: region-scoped queries, pagination, one listener per view (not per event), unsubscribe on unmount, collection-group for responders, TTL policies on high-volume sub-collections (location trail), budget alerts at 50/80/100 %.

### 17.5 Runbooks (OPS-06)
SOS pipeline down · notification provider outage · region-routing error · escalation not firing · supervisor lockout · admin lost/compromised · key rotation · data-subject request · suspected breach.

---

## 18. Team operating model

### 18.1 Tracks and owners
| Track | Responsibility |
|---|---|
| Frontend | Web app, map, tables, admin/supervisor UX, FE tests |
| Backend/Security | Firestore, rules, APIs, RBAC/claims, lifecycle, notifications, audit |
| Mobile | SOS, background behaviour, triggers, GPS, evidence capture |
| AI/Data | Risk, follow, audio/crowd intelligence, evaluation |
| DevOps/QA | CI/CD, environments, monitoring, test automation, device matrix, release gates |

**Small-team adaptation [New]:** one person may hold several tracks, but **the reviewer of a change must be someone who didn't write it**, and the security-rules + escalation code always gets a second reviewer. The team lead is accountable for cross-track outcomes and owns the go/no-go decision.

### 18.2 Ticketing rules
Every ticket has: owner, dependency, acceptance criteria, test case, security impact, demo evidence. Labels FE/BE/MOB/AI/QA/OPS/SEC; priorities P0/P1/P2 — never treat everything as urgent. Done = §0.4.

---

## 19. Risks & success measures

### 19.1 Risk register
| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | OS restrictions break background detection / silent triggers | H | H | Device matrix early; manual SOS first; "where OS permits"; watchdog |
| R2 | Authorization gaps expose events across regions | M | H | Claims + rules + backend checks; negative tests as CI gate |
| R3 | SOS unseen — no supervisor responds | M | H | SLA + escalation ladder + independent contact notification + FE-15 |
| R4 | False positives → alert fatigue; false negatives → lost trust | H | M | Shadow mode, thresholds, cancellation, pilot tuning |
| R5 | Evidence handling creates legal/privacy exposure | M | H | DPIA, consent, retention, encryption, access logging first |
| R6 | Backend outage disables SOS | L | H | Direct create-only write, offline queue, health alerts, runbooks |
| R7 | Scope creep: AI starves the secure core | H | M | Phase gates; AI starts after foundation is stable |
| R8 | Realtime cost/performance grows with supervisors × events | M | M | Region-scoped queries, pagination, load tests, budget alerts |
| R9 | Region-routing errors near boundaries | M | M | Server geofencing, overlap/fallback rules, boundary tests |
| R10 | Single points of knowledge / unclear ownership | M | M | Named owners, ADRs, docs in Definition of Done |
| R11 [New] | A public endpoint or permissive rule slips back in | M | H | Endpoint-inventory CI test; rules tests; code review checklist |
| R12 [New] | Single regional admin unavailable/compromised | M | M | Platform-admin break-glass; deputy policy (DD-13) |
| R13 [New] | Notification provider failure/DLT delays | M | H | Provider failover, early DLT registration, delivery monitoring |
| R14 [New] | Migration (Mongo→Firestore) corrupts approvals | L | H | Dual-run, diff reports, rollback plan |

### 19.2 Starting success measures (calibrate in Phase 0/3)
| Measure | Starting target |
|---|---|
| SOS → visible latency | p95 ≤ 5 s |
| Event integrity | Zero lost, zero duplicate incidents under retries/disconnects |
| First-response (ack) time | Within SLA; breaches escalate automatically |
| Escalation reliability | 100 % of unacked events escalate on time |
| Evidence durability | No unexplained loss after interruption/app kill |
| Detector quality | Thresholds set before leaving shadow mode |
| Battery cost | Budget agreed per device class |
| Authorization defects | Zero critical |
| Notification delivery | Delivery status known for 100 % of sends; failures retried/alerted |

---

## 20. Decision register

| ID | Decision | Recommendation | Status | By phase |
|---|---|---|---|---|
| DD-01 | Event model | Two collections (`ongoingEvents`/`pastEvents`) with same doc ID, transactional move + audit | **Closed** (matches code) | 0 |
| DD-02 | Region assignment | Server-derived geofence; client value is a hint; admin-audited changes | Open → close | 1 |
| DD-03 | Authorization source | Claims (`role`,`regionId`) **plus** `staff` status lookup in rules | Open → close | 1 |
| DD-04 | Token strategy | Firebase ID tokens only; no parallel JWT | **Closed** (matches code; verify) | 0 |
| DD-05 | SOS write path | Direct create-only Firestore write + backend triggers | Open → close | 1 |
| DD-06 | Mobile platform/device scope | Fix OS versions + P0 device matrix; per-platform silent-trigger feasibility | **Open — urgent** | 0 |
| DD-07 | Escalation policy | SLA + ladder (supervisor → admin → fallback); contacts independent; relation to emergency services | Open | 1 (impl. 2–3) |
| DD-08 | Evidence policy | Encryption, retention, access, deletion, chain of custody — before any recording | Open | 3 (before 4) |
| DD-09 | Map provider & PII | Keep Mappls; restrict key; minimise PII on pins | Recommend close | 2 |
| DD-10 | Intelligence v1 | Rule-based + explainable, shadow mode first | Open | 4 |
| DD-11 [New] | Database consolidation | Retire MongoDB → Firestore only | Recommend close | 0 |
| DD-12 [New] | Staff data model | Single `staff` collection (role field) instead of separate `admins`/`supervisors`; admin uniqueness via `regions.adminUid` | Recommend close | 0 |
| DD-13 [New] | Platform admin / break-glass | Define a platform-admin role for uncovered regions and admin recovery; ≤ 2 people, MFA, audited | Open | 0 |
| DD-14 [New] | Stale/unresolved event policy | No silent auto-archive; STALE flag → escalate → human close; optional long-TTL archive with notification | Open | 0 |
| DD-15 [New] | Community responder governance | Vetting, consent for location sharing, what supervisors may see, abuse handling | Open | 3 |
| DD-16 [New] | Hosting | Web on Vercel; API on Cloud Run; functions 2nd gen + Cloud Scheduler | Recommend close | 0 |
| DD-17 [New] | Environments | Separate Firebase projects: staging, prod; emulators for dev | Recommend close | 0 |

---

## 21. Go / No-Go checklist for M6 (Production Candidate)

| Gate | Pass condition | Sign-off |
|---|---|---|
| Authorization | Cross-region and escalation tests pass; rules deployed and in CI; endpoint-inventory test green | Security lead |
| SOS reliability | Duplicate-free ingestion; no silent loss under disconnect/reconnect; escalation timers verified | Backend lead |
| Mobile | P0 scenarios pass on the supported-device matrix incl. background + low battery | Mobile lead |
| Evidence | Encrypted upload survives interruption; access least-privilege + logged; retention jobs run | Backend + Mobile |
| Intelligence | Each live detector meets precision/recall; others remain in shadow | AI lead |
| Operations | Monitoring, alerts, backups + restore drill, runbooks, on-call defined | DevOps |
| Privacy & legal | DPIA done; consent/retention approved; recording legality reviewed | Team lead + Legal |
| Notifications | SMS/WhatsApp provider live (DLT done); delivery tracking verified | Backend lead |
| Drills | End-to-end incident drill passes repeatedly with trained supervisors | QA + Team lead |
| Defects | Zero open P0; known P1s owned with plan | Team lead |

---

## 22. Start here — first sprint (Phase 0)

Do these in order; each is small and unblocks the next:

1. **Inventory every route** and confirm which are unauthenticated (verify C-01, H-01, H-02 in code). *(½ day)*
2. **HF-01** lock the resolve endpoint; **HF-03** lock cleanup routes. *(same PR set)*
3. **HF-02** delete legacy `/dashboard` and `/currentstatus`.
4. **Check whether Firestore rules exist in the Firebase console**; export them. Deploy **HF-05** baseline rules to staging first, then prod, with emulator tests.
5. **OPS-02** create staging/prod projects; stop using the current project for test events.
6. **HF-04** token-derived UID on identity endpoints + `/auth/me`.
7. **HF-06/07** secrets, key restrictions, CORS/helmet/rate-limit; fix the Mumbai/Nagpur dead-end.
8. **OPS-01/03** repo hygiene + CI baseline.
9. **Decision meeting:** close DD-01, 04, 06, 11, 12, 13, 14, 16, 17 and write ADRs.
10. **Threat-model workshop (SEC-01)** and start **AI-01** in parallel.

---

## Appendix A — Environment variables

**Backend (`backend/.env`; prod uses secret manager + ADC)**
| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT` | Runtime |
| `FIREBASE_PROJECT_ID` | Target project (per env) |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | **Local dev only**; on Cloud Run use ADC (no key) |
| `MONGO_URI` | **Temporary** — only until BE-20 cutover, then delete |
| `CORS_ORIGINS` | Comma-separated allow-list |
| `LOG_LEVEL`, `SENTRY_DSN` | Observability |
| `SMTP_*` or `EMAIL_API_KEY` | Approval/rejection emails |
| `SMS_PROVIDER_*`, `DLT_*` | Contact notifications (India DLT) |
| `INTERNAL_JOBS_AUDIENCE` | Verifies Scheduler OIDC tokens on `/internal/jobs/*` |

**Frontend (`frontend/.env.*`; all prefixed `VITE_`, none secret)**
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base URL |
| `VITE_FIREBASE_*` | Web SDK config (per env) |
| `VITE_MAPPLS_KEY` | Map key, **domain-restricted**; inject at build instead of hard-coding in `index.html` |
| `VITE_ENV` | `dev`/`staging`/`prod` banner |

---

## Appendix B — Ticket template
| Field | What to write |
|---|---|
| Title / ID / Label | Short imperative; `FE-xx`, `BE-xx`, …; label |
| Owner / Reviewer | One accountable owner; reviewer from another track for cross-boundary work |
| Priority / Phase | P0/P1/P2; phase and milestone |
| Dependencies | Tickets, decisions (DD-xx), environments |
| Acceptance criteria | Observable, testable; include failure/empty states |
| Test case(s) | Unit / rules / integration / realtime / device / recovery, and the gate it feeds |
| Security & privacy impact | Data touched, authz implications, logging, threat-model link |
| Demo evidence | Recording, test report or drill output |
| Definition of Done | Implemented + tested + reviewed + documented + deployable |

---

## Appendix C — Glossary
| Term | Meaning |
|---|---|
| SOS event | User-triggered emergency record in `ongoingEvents`, archived to `pastEvents` |
| Region | Operational area served by one admin and several supervisors (slug id) |
| RBAC | Role-based access control (user, supervisor, admin, platform admin) |
| Custom claims | `role`/`regionId` embedded in the Firebase ID token by the backend |
| Idempotency | Repeating a request does not repeat its effect (UUID doc ID, deterministic audit ID) |
| Shadow mode | Run a detector and log decisions without alerting anyone |
| STALE | Unresolved event with no recent location heartbeat (flag, not an archive trigger) |
| Escalation ladder | Supervisor → region admin → fallback control room |
| Chain of custody | Auditable record of who captured, stored and accessed evidence |
| DPIA | Data-protection impact assessment |
| ADC | Application Default Credentials (no key file on Google-hosted runtimes) |
| DLT | India's telecom registry required for transactional SMS |

---

## Appendix D — Traceability
- **From the codebase doc [Code]:** current stack and versions, roles, onboarding flow, route guard, `extractLatLng`, Mappls integration + proximity deconfliction, responders/acceptors, history search, admin tabs, resolve batch, 24 h cleanup daemon, MongoDB + Firestore schemas, API and page tables, directory tree, setup steps, the audit fixes already applied (`/auth/status` 404, `package.json`, nodemon, `.env.example`, build verified).
- **From the audit [Audit]:** product vision, ten features and priorities, three-part operating model, F1–F8, DD-01–10, access matrix, extended lifecycle, approval states, eight phases, FE-01–16, BE-01–19, M-01–08, threat model, testing layers, milestones, RACI, go/no-go, risk register, success measures.
- **Added by this merge [New]:** reconciliation §2.2; codebase-derived findings C/H/M §4.1; Phase 0 hotfix set (HF-01–07) and OPS/SEC/QA/LEGAL tickets; BE-20–23, FE-17–20, M-09–11; `staff`, `regions`, `regionGeo`, `auditLogs`, `notifications` collections; rules skeleton; closing transaction; API target; environments and hosting; STALE-as-flag; platform admin; responder governance; migration plan; CI sample; decisions DD-11–17; risks R11–R14.
- **Not verifiable from either file:** source code contents, whether Firestore rules exist in the console, test results, deployments, mobile app state, runtime behaviour. Phase 0 starts by verifying these.
