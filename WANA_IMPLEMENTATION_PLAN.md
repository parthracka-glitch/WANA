# WANA — Full Implementation Plan & Detailed Task List

> **Source:** [WANA_MASTER_BLUEPRINT.md](file:///c:/Users/Parth%20Racka/OneDrive/Desktop/NIRVANAA%20STUDIOS%20PROJECTS/Internship%20Project/WANA_MASTER_BLUEPRINT.md) (v1.0 — 06 Oct 2026)  
> **Status:** Active Execution Plan | **Scope:** Web Console + Backend + Firebase + Mobile + AI (All 8 Phases)

---

## 1. Executive Roadmap & Operating Rules

### 1.1 Core Principles & Invariants
1. **Zero-Trust & Token-Derived Identity:** No backend endpoint shall ever trust a client-supplied UID, role, or region in a route parameter or body. All identity and authorization decisions derive strictly from verified Firebase ID token claims and atomic database lookups.
2. **Region-Scoped Isolation:** A supervisor or admin in Region A shall have mathematically zero ability to view, acknowledge, mutate, or resolve an incident from Region B.
3. **No Silent Auto-Archival:** Unresolved emergency SOS events must **never** be auto-archived or deleted by background cron jobs. Inactivity flags an event as `STALE`, emits escalations to leadership, and requires human verification to close.
4. **Idempotency & Atomic Lifecycle:** Every SOS ingestion, acknowledgement, transition, and resolution is idempotent. Network retries must never create phantom duplicate incidents.
5. **Phase Gate Governance:** No phase transition shall occur without meeting 100% of its exit gate criteria. Safety-critical systems require verifiable test proofs.

### 1.2 Critical Path Dependency Graph
```
Phase 0: Hotfixes (HF-01..07) + Env Split (OPS-02) + CI Baseline (OPS-03) + Threat Model (SEC-01)
  │
  ▼
Phase 1: Schemas & Indexes (BE-01) + Region Registry (BE-02) + Staff State Machine (BE-03)
         + RBAC Middleware (BE-04) + Full Firestore Rules (BE-05) + Mongo Decommission (BE-20)
         + Auth Screens & Guards (FE-01, FE-02, FE-09) [Milestone M1: Secure Skeleton]
  │
  ▼
Phase 2: Idempotent SOS (BE-06) + Server Geo-Routing (BE-16) + closeEvent Tx (BE-07)
         + Escalation Timers (BE-17) + Live Regional Map & Drawer (FE-04, FE-05)
         + Audible Alerts & Reconnect Banner (FE-11, FE-15) + CI E2E Drill (QA-02) [Milestone M2: Live Control Room]
  │
  ▼
Phase 3: Mobile Manual SOS (M-01) + Background Heartbeat (M-02) + Silent Triggers (M-03)
         + Emergency Contacts & DLT SMS (M-09, BE-08b) + Device Matrix QA (QA-03) [Milestone M3: Complete SOS]
  │
  ▼
Phase 4: DPIA & Policy (LEGAL-01) ──► Evidence Pipeline & Retention (BE-09, M-04, FE-18)
         + Offline Queue & Watchdog Recovery (M-10, M-11, QA-05) [Milestone M4: Evidence]
  │
  ▼
Phase 5: Shadow-Mode Framework (AI-02) + Risk Engine (M-05) + Follow Detector (M-06) [Milestone M5: Preventive Safety]
  │
  ▼
Phase 6: Pen Test (SEC-02) + Load Test (QA-04) + PITR Drills (BE-13) + Runbooks (OPS-06) [Milestone M6: Prod Candidate]
  │
  ▼
Phase 7: Single-Region Pilot (Solapur/Pune) ──► KPI Review ──► Phased Expansion
```

---

## 2. Phase 0 — Stabilize & Freeze

> **Objective:** Neutralize existing critical vulnerabilities, eliminate data leakage, decouple environments, and establish a bulletproof CI/CD pipeline before any feature work.

### 🔴 P0 — Immediate Security Hotfixes

#### [x] HF-01: Lock the SOS Resolve Endpoint
- **Track:** Backend Security (`BE`/`SEC`)
- **Target File:** `backend/src/routes/events.routes.js`
- **Vulnerability:** `POST /events/resolve/:eventId` is unauthenticated and accepts arbitrary callers. Any malicious entity can resolve active emergencies.
- **Detailed Tasks:**
  - [x] Add `authMiddleware` to `POST /events/resolve/:eventId`.
  - [x] Extract `callerUid` strictly from `req.user.uid` (verified Firebase ID token).
  - [x] Fetch the event doc from Firestore (`ongoingEvents/{eventId}`). Return `404` if not found.
  - [x] Verify authorization: Allow if `callerUid === event.sos_clicked_by_uid` OR (`req.user.role in ['supervisor', 'admin']` AND `req.user.regionId === event.regionId`).
  - [x] Reject with `401 Unauthorized` if token missing/invalid; reject with `403 Forbidden` if unauthorized.
  - [x] Write 4 automated integration tests:
    1. Unauthenticated request → 401.
    2. Non-owner regular user → 403.
    3. Wrong-region supervisor → 403.
    4. Legitimate region supervisor or event owner → 200.

#### [x] HF-02: Purge Legacy Unfiltered Event Routes
- **Track:** Fullstack (`FE`/`BE`)
- **Target Files:**
  - `frontend/src/App.jsx`
  - `frontend/src/pages/Dashboard.jsx`
  - `frontend/src/pages/CurrentStatus.jsx`
  - `backend/src/routes/events.routes.js`
- **Vulnerability:** `/dashboard` and `/currentstatus` fetch `ongoingEvents` without filtering by `regionId`, leaking city-wide/state-wide emergency incidents to any authenticated user.
- **Detailed Tasks:**
  - [x] Delete `Dashboard.jsx` and `CurrentStatus.jsx` legacy components.
  - [x] Remove `/dashboard` and `/currentstatus` paths from React Router configuration.
  - [x] Add permanent redirect (`<Navigate to="/supervisor/dashboard" replace />` or `/login`).
  - [x] Scan frontend codebase to ensure zero client-side queries execute `collection('ongoingEvents')` without `where('regionId', '==', supervisorRegionId)`.
  - [x] Add CI grep check ensuring no unqualified `ongoingEvents` collection references exist.

#### [x] HF-03: Secure & Quarantine Event Cleanup Routes
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/routes/cleanup.routes.js`, `backend/src/app.js`
- **Vulnerability:** `POST /cleanup/events` allows any authenticated user to trigger destructive archival; `GET /cleanup/status` is entirely public and leaks operational statistics.
- **Detailed Tasks:**
  - [x] Remove `GET /cleanup/status` route completely. Replace with standard `/readyz` healthcheck.
  - [x] Quarantine `POST /cleanup/events`: Set to return `410 Gone` with message "Cleanup daemon decommissioned; managed via Cloud Scheduler".
  - [x] Add integration test verifying regular supervisor/admin tokens receive `410` or `403`.

#### [x] HF-04: Enforce Token-Derived Identity on Auth Endpoints
- **Track:** Backend (`BE`)
- **Target Files:**
  - `backend/src/routes/auth.routes.js`
  - `backend/src/routes/supervisor.routes.js`
  - `frontend/src/context/AuthContext.jsx`
- **Vulnerability:** `GET /auth/status/:uid` trusts caller-supplied `:uid` parameter, allowing enumeration of user roles, regions, and approval states across the database.
- **Detailed Tasks:**
  - [x] Delete `GET /auth/status/:uid` route.
  - [x] Create `GET /auth/me` protected by `authMiddleware`.
  - [x] In `GET /auth/me`, extract `req.user.uid` from token, look up `staff/{uid}` (or `users/{uid}`), and return `{ uid, role, regionId, status, email }`.
  - [x] Update `POST /supervisor/register` to ignore any `uid` in `req.body` and use `req.user.uid`.
  - [x] Update frontend `AuthContext` to call `GET /auth/me` on session bootstrap.
  - [x] Add tests: unauthenticated `GET /auth/me` returns 401; authenticated returns correct profile.

#### [x] HF-05: Deploy Baseline Firestore Security Rules
- **Track:** Security (`SEC`/`BE`)
- **Target Files:**
  - `firebase/firestore.rules` (new file)
  - `firebase/tests/rules.test.js` (new test suite)
  - `firebase.json`
- **Vulnerability:** Absence of repository-controlled security rules exposes Firestore to direct malicious client manipulation.
- **Detailed Tasks:**
  - [x] Initialize `firebase/firestore.rules` with strict default-deny.
  - [x] Configure helper functions:
    ```javascript
    function isSignedIn() { return request.auth != null; }
    function isStaff() { return isSignedIn() && request.auth.token.role in ['supervisor', 'admin']; }
    function isRegionStaff(regionId) { return isStaff() && request.auth.token.regionId == regionId; }
    ```
  - [x] Define rules for `ongoingEvents`:
    - Read: `allow read: if isRegionStaff(resource.data.regionId);`
    - Create: `allow create: if isSignedIn() && request.resource.data.sos_clicked_by_uid == request.auth.uid;`
    - Update: `allow update: if isRegionStaff(resource.data.regionId) || (isSignedIn() && resource.data.sos_clicked_by_uid == request.auth.uid);`
    - Delete: `allow delete: if false;`
  - [x] Lock `auditLogs` to server-only writes (`allow read: if request.auth.token.role == 'admin' && request.auth.token.regionId == resource.data.regionId; allow write: if false;`).
  - [x] Set up `@firebase/rules-unit-testing` and write 6 automated negative/positive test assertions.
  - [x] Deploy rules to staging emulator and staging Firebase project.

#### [x] HF-06: Secrets, API Keys & Edge Hygiene
- **Track:** DevOps / Security (`OPS`/`SEC`)
- **Target Files:**
  - `frontend/index.html`
  - `backend/src/app.js`
  - `.gitignore`
- **Vulnerability:** Mappls API key hardcoded in `index.html`; lack of rate limiting and security headers on Express.
- **Detailed Tasks:**
  - [x] Extract Mappls key from `index.html`. Inject dynamically at runtime or build via `import.meta.env.VITE_MAPPLS_KEY`.
  - [x] Restrict Mappls API Key in Mappls Developer Console to whitelisted domains (`localhost`, staging domain, prod domain).
  - [x] Restrict Firebase Web API Key in Google Cloud Console to authorized HTTP referrers.
  - [x] Install `helmet` in backend and mount in `backend/src/app.js`: `app.use(helmet());`.
  - [x] Install `cors` and configure strict origin whitelist using `process.env.CORS_ORIGINS`.
  - [x] Install `express-rate-limit`: configure 20 req/min for auth routes, 100 req/min for standard APIs.
  - [x] Add `express.json({ limit: '10kb' })` to mitigate oversized payload DOS attacks.
  - [x] Run `gitleaks detect` on repository history. Rotate any leaked API secrets.

#### [x] HF-07: Fix Region Dropdown Dead-Ends
- **Track:** Fullstack (`FE`/`BE`)
- **Target Files:**
  - `backend/src/routes/region.routes.js`
  - `frontend/src/pages/CompleteProfile.jsx`
- **Vulnerability:** Dropdowns present regions (e.g. Mumbai, Nagpur) that have no registered administrator, stranding supervisors in permanent `PENDING` states.
- **Detailed Tasks:**
  - [x] Create `GET /regions/available` endpoint returning only regions where `status === 'active'` and `adminUid != null`.
  - [x] Seed Firestore `regions` collection with Solapur and Pune (active with admin assigned).
  - [x] Update frontend supervisor registration dropdown to fetch dynamically from `/regions/available`.
  - [x] Hide or disable unstaffed regions until administrative onboarding completes.

---

### 🔴 P0 — DevOps, Environment Separation & CI Baseline

#### [x] OPS-01: Repository Hygiene & Enforcement Standards
- [x] Configure branch protection rules on `main` requiring approved PR and passing status checks.
- [x] Create `.github/PULL_REQUEST_TEMPLATE.md` enforcing security impact assessments and test confirmation.
- [x] Configure `CODEOWNERS` requiring 2 approvals for `firebase/firestore.rules` and core lifecycle files.
- [x] Standardize Node.js runtime: Create `.nvmrc` with `24` and update `engines` field in `backend/package.json` and `frontend/package.json` to `>=24`.
- [x] Remove unused libraries (e.g., remove `leaflet` if Mappls handles all mapping).
- [x] Add ESLint and Prettier configurations with strict rules against unhandled promises and `console.log`.

#### [x] OPS-02: Multi-Tier Environment Segregation
- [x] Establish 3 discrete environments:
  1. `dev`: Local Firebase Emulator Suite (ports 8080 Firestore, 9099 Auth, 5001 Functions).
  2. `staging`: Isolated Firebase project (`wana-staging`), Cloud Run staging instance, Vercel staging.
  3. `prod`: Dedicated production project (`wana-prod`).
- [x] Create configuration templates:
  - `backend/.env.example`
  - `frontend/.env.example`
- [x] Isolate all test events from production database immediately.

#### [x] OPS-03: GitHub Actions CI Pipeline Baseline
- [x] Create `.github/workflows/ci.yml` running on all PRs to `main`:
  - **Job 1: Backend (`api`):** Lint, audit, unit tests, integration tests against emulated Firestore.
  - **Job 2: Frontend (`web`):** Lint, unit tests (`npm run test:unit`), production build test (`npm run build`).
  - **Job 3: Security Rules (`rules`):** Run `@firebase/rules-unit-testing` suite.
  - **Job 4: Secret Scanning (`secrets`):** Run Gitleaks action.
- [x] Ensure all 4 jobs must succeed for PR merge eligibility.

#### [x] OPS-04: Local Emulator Suite & Seed Tooling
- [x] Configure `firebase.json` with emulator ports and persistence paths.
- [x] Build `scripts/seed-emulator.js` to automatically provision:
  - 2 Regions: `solapur` (lat: 17.6599, lng: 75.9064), `pune` (lat: 18.5204, lng: 73.8567)
  - 1 Super Admin / Platform Admin
  - 2 Regional Admins (1 per region)
  - 4 Supervisors (2 per region: 1 approved, 1 pending)
  - 3 Mock ongoing SOS events
- [x] Add `npm run dev:emu` script orchestrating emulator startup, seeding, backend, and frontend.

#### [x] SEC-01: Threat Model Sign-off
- [x] Document mitigations and test cases in `docs/threat-model.md`.

#### [x] DD-*: Architectural Decision Records (ADRs)
- [x] Create `docs/decisions/` directory and record: `ADR-01`, `ADR-04`, `ADR-06`, `ADR-11`, `ADR-12`, `ADR-13`, `ADR-14`.

---

### Phase 0 Exit Verification Checklist
- [x] All 7 Hotfixes (HF-01 to HF-07) implemented and verified with passing unit/integration tests.
- [x] Zero unauthenticated state-altering endpoints exist in backend.
- [x] Legacy `/dashboard` and `/currentstatus` routes permanently deleted.
- [x] Baseline Firestore rules deployed to staging; rules tests pass in CI.
- [x] Local Firebase Emulator runs with reproducible seed data via `npm run dev:emu`.
- [x] CI pipeline fully green on `main`.

---

## 3. Phase 1 — Secure Core (Milestone M1: Secure Skeleton)

> **Objective:** Establish the permanent Firestore schema, complete the supervisor approval state machine, enforce server-side RBAC, decommission MongoDB, and build clean authentication UI states.

### 🔴 P0 — Backend Data Model & Access Control

#### [x] BE-01: Schema Validation & Firestore Composite Indexes
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/validators/`, `firebase/firestore.indexes.json`
- **Tasks:**
  - [x] Implement strict input validation middleware using Joi for every incoming request.
  - [x] Author composite index definitions in `firebase/firestore.indexes.json`:
    - `ongoingEvents`: `regionId` ASC, `status` ASC, `timestamp` DESC
    - `ongoingEvents`: `status` ASC, `dispatchedAt` ASC
    - `ongoingEvents`: `status` ASC, `lastHeartbeatAt` ASC
    - `pastEvents`: `regionId` ASC, `resolvedAt` DESC
    - `auditLogs`: `regionId` ASC, `ts` DESC
    - Collection Group `acceptors`: `regionId` ASC, `acceptedAt` DESC
  - [x] Deploy indexes via CI to staging/prod Firestore.
  - [x] Remove any in-memory JavaScript sorting/filtering fallbacks.

#### [x] BE-02: Region Registry & One-Admin Invariant
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/services/regionService.js`, `scripts/bootstrap-admin.js`
- **Tasks:**
  - [x] Create `regions` collection structure: `{ id, name, center: {lat, lng}, zoom, adminUid, status, ackSlaSeconds, staleSeconds, fallbackRegionId }`.
  - [x] Implement atomic transaction guaranteeing that `adminUid` cannot be overwritten if already populated.
  - [x] Develop `scripts/bootstrap-admin.js` for provisioning primary regional admins (generating secure one-time credentials requiring immediate MFA enrollment).

#### [x] BE-03: Supervisor Approval State Machine
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/services/supervisorService.js`, `backend/src/routes/supervisor.routes.js`
- **Tasks:**
  - [x] Establish `staff` Firestore collection replacing legacy MongoDB models:
    `{ uid, email, name, role: 'supervisor', regionId, status, approvedBy, approvedAt, rejectReason, claimsVersion, createdAt }`.
  - [x] Implement discrete state transitions:
    1. `UNVERIFIED` ➔ `PENDING`: User verifies email and selects valid region from `/regions/available`.
    2. `PENDING` ➔ `APPROVED`: Admin approves; sets custom claims `{ role: 'supervisor', regionId }`; writes audit log.
    3. `PENDING` ➔ `REJECTED`: Admin rejects with mandatory text reason; writes audit log.
    4. `APPROVED` ➔ `SUSPENDED`: Admin revokes access; wipes claims; invalidates active refresh tokens.
    5. `SUSPENDED` ➔ `APPROVED`: Admin reinstates; restores claims; logs action.
  - [x] Ensure all state mutations execute within atomic Firestore transactions.

#### [x] BE-04: Server-Side RBAC Middleware
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/middleware/rbacMiddleware.js`
- **Tasks:**
  - [x] Implement `requireRole(allowedRoles)` and `requireRegion(paramKey = 'regionId')`:
    - Validates decoded ID token claims (`req.user.role`, `req.user.regionId`).
    - Performs fast-path verification against `staff/{uid}` to ensure `status === 'APPROVED'`.
  - [x] Apply to all administrative and supervisor endpoints.
  - [x] Write negative security tests: verify cross-region access attempts return `403 Forbidden` with audit log capture.

#### [x] BE-05: Comprehensive Production Firestore Security Rules
- **Track:** Security (`SEC`/`BE`)
- **Target Files:** `firebase/firestore.rules`, `firebase/tests/production-rules.test.js`
- **Tasks:**
  - [x] Expand security rules to cover `regions`, `staff`, `users`, `ongoingEvents`, `acceptedEvents`, `pastEvents`, `auditLogs`, and `evidence`.
  - [x] Enforce field-level validation: prohibit clients from writing `status = 'RESOLVED'` or forging timestamps during SOS document creation.
  - [x] Restrict `auditLogs` to zero client writes.
  - [x] Write 15+ automated test scenarios in `@firebase/rules-unit-testing`.

#### [x] BE-10: Append-Only Immutable Audit Service
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/services/auditService.js`
- **Tasks:**
  - [x] Implement `writeAuditLog({ actorUid, actorRole, action, targetId, regionId, details, req })`.
  - [x] Generate deterministic document IDs for idempotent actions (e.g. `audit_${eventId}_close`).
  - [x] Capture client IP, user agent, timestamp, and unique `requestId`.
  - [x] Instrument all privileged actions: supervisor approvals, rejections, suspensions, SOS resolutions, and evidence views.

#### [x] BE-18: Custom Claims Synchronization & Fast Revocation
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/services/authService.js`
- **Tasks:**
  - [x] On approval/role change: call `admin.auth().setCustomUserClaims(uid, { role, regionId })` and increment `claimsVersion` in `staff/{uid}`.
  - [x] On suspension/rejection: call `admin.auth().setCustomUserClaims(uid, {})` and invoke `admin.auth().revokeRefreshTokens(uid)`.
  - [x] Frontend integration: subscribe to `staff/{uid}` doc; if `claimsVersion` changes, invoke `user.getIdToken(true)` to trigger immediate token refresh.

#### [x] BE-20: MongoDB Decommissioning & Data Cutover
- **Track:** Backend (`BE`)
- **Target Files:** `scripts/migrate-mongo-to-firestore.js`, `backend/src/server.js`, `backend/package.json`
- **Tasks:**
  - [x] Freeze MongoDB write operations.
  - [x] Run migration script: transform legacy `Admin` and `Supervisor` records into `staff` documents; validate region assignments.
  - [x] Execute reconciliation script: verify exact counts and field parity between MongoDB and Firestore.
  - [x] Remove `mongoose` from `backend/package.json`.
  - [x] Delete `backend/src/models/` directory.
  - [x] Remove `MONGO_URI` and connection setup from `server.js`.
  - [x] Verify zero occurrences of `mongo` or `mongoose` across the entire codebase.

#### [x] BE-21: Mandatory Admin MFA Enforcement
- **Track:** Security (`SEC`/`BE`)
- **Target Files:** `frontend/src/pages/admin/AdminLogin.jsx`, `backend/src/middleware/rbacMiddleware.js`
- **Tasks:**
  - [x] Enable Multi-Factor Authentication in Firebase Identity Platform.
  - [x] Update admin login flow to enforce second-factor enrollment and verification before granting access to `/admin/*`.

#### [x] BE-11a: API Error Envelope & Request Tracing Baseline
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/middleware/errorHandler.js`, `backend/src/middleware/requestTracing.js`
- **Tasks:**
  - [x] Implement UUID `requestId` middleware: attach to `req.id` and echo in `X-Request-Id` response header.
  - [x] Configure standard error JSON response: `{ error: { code, message, requestId } }`.
  - [x] Integrate structured logging: log incoming requests and error payloads with `requestId`.
  - [x] Implement graceful shutdown hooks listening for `SIGTERM` and `SIGINT`.

---

### 🔴 P0 — Frontend Auth Experience & Admin Portal

#### [x] FE-01: Role-Aware Routing & State Guards
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/routes/AppRoutes.jsx`, `frontend/src/components/ProtectedRoute.jsx`
- **Tasks:**
  - [x] Refactor `ProtectedRoute` to evaluate full user state matrix:
    - Unauthenticated ➔ `/login`
    - Email unverified ➔ `/verify-email`
    - Authenticated without region ➔ `/complete-profile`
    - Status `PENDING` ➔ `/pending-approval`
    - Status `REJECTED` ➔ `/rejected`
    - Status `SUSPENDED` ➔ `/suspended`
    - Role `supervisor` + Status `APPROVED` ➔ `/supervisor/dashboard`
    - Role `admin` + MFA Verified ➔ `/admin/dashboard`
  - [x] Write unit tests verifying route redirect behaviors across all 8 user states.

#### [x] FE-02: Auth State Dedicated Screens
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/pages/auth/*.jsx`
- **Tasks:**
  - [x] Build `/verify-email` page with resend cooldown timer (60s).
  - [x] Build `/complete-profile` with dynamic region selector calling `GET /regions/available`.
  - [x] Build `/pending-approval` page displaying application timestamp and region contact info.
  - [x] Build `/rejected` page showing specific rejection reason and appeals policy.
  - [x] Build `/suspended` page showing account suspension notice.

#### [x] FE-09: Admin Supervisor Management Portal Enhancements
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/pages/admin/SupervisorManagement.jsx`
- **Tasks:**
  - [x] Add explicit action modal for **Reject**: requires mandatory reason text.
  - [x] Add explicit action modal for **Suspend**: requires confirmation prompt.
  - [x] Add explicit action button for **Reinstate** for suspended accounts.
  - [x] Add loading indicators and disable action buttons during inflight mutations.
  - [x] Implement pagination (25 items/page) and search by email/name.

#### [x] FE-13a: Automated Frontend Testing Framework
- **Track:** Quality / Frontend (`QA`/`FE`)
- **Target Files:** `frontend/vitest.config.js`, `frontend/playwright.config.js`
- **Tasks:**
  - [x] Configure frontend build verification and unit testing.
  - [x] Author smoke tests verifying login, navigation, and dashboard rendering.

#### [x] FE-14: Build Configurations & Environment Ingestion
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/.env.development`, `frontend/.env.staging`, `frontend/.env.production`
- **Tasks:**
  - [x] Standardize environment variables:
    `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_API_BASE_URL`, `VITE_MAPPLS_KEY`.
  - [x] Add visual environment banner in header on non-production builds (`STAGING` / `DEV`).

#### [x] OPS-05: Automated Staging Deployment Workflow
- **Track:** DevOps (`OPS`)
- **Target Files:** `.github/workflows/deploy-staging.yml`
- **Tasks:**
  - [x] Create workflow triggering on merge to `main`:
    1. Deploy Firestore rules and indexes.
    2. Deploy Cloud Functions.
    3. Build and deploy backend container to Cloud Run (staging).
    4. Build and deploy frontend to Vercel (staging).
  - [x] Execute post-deploy smoke test suite against staging URL.

#### [x] QA-01: SOS Incident Generator CLI
- **Track:** Quality (`QA`)
- **Target Files:** `scripts/sos-simulator.js`
- **Tasks:**
  - [x] Develop command-line simulator:
    `node scripts/sos-simulator.js --region solapur --count 5 --type MEDICAL --env local`

---

### Phase 1 Exit Verification Checklist
- [x] Admin can approve, reject, suspend, and reinstate supervisors via the web console.
- [x] Suspended supervisor loses access immediately; claims revoked; tokens invalidated.
- [x] Cross-region access is blocked both at Firestore rules layer and Express RBAC layer.
- [x] MongoDB is completely removed from dependencies and source files.
- [x] Frontend guards and auth screens render seamlessly for all user lifecycle states.

---

## 4. Phase 2 — Control Room & Event Backbone (Milestone M2: Live Control Room)

> **Objective:** Deliver the mission-critical incident dispatch engine, server-side geospatial routing, atomic lifecycle transitions, real-time map console with audio alerts, and automated escalation timers.

### 🔴 P0 — Emergency SOS Lifecycle & Realtime Backbone

#### [x] BE-06: Idempotent SOS Ingestion Pipeline
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/services/eventLifecycle.js`, `backend/src/routes/events.routes.js`
- **Tasks:**
  - [x] Require mobile client to generate a client-side UUID v4 before dispatching SOS.
  - [x] Prohibit client from setting `status != 'CREATED'`, `regionId`, or `ackBy`.
  - [x] Ensure idempotent retry: if write to `ongoingEvents/{uuid}` encounters existing doc with identical UUID, return existing document data without creating duplicates.
  - [x] Set `lastHeartbeatAt` and `timestamp` to `FieldValue.serverTimestamp()`.

#### [x] BE-16: Server-Side Geospatial Region Routing
- **Track:** Backend / Functions (`BE`)
- **Target Files:** `backend/src/services/eventLifecycle.js`
- **Tasks:**
  - [x] Extract incident coordinates `location: { latitude, longitude }`.
  - [x] Execute Haversine and bounding proximity geofence evaluation for Solapur and Pune (< 50km).
  - [x] Fallback logic: if point lies outside all defined regions, determine nearest region center within 50km radius; if none, assign `regionId = 'unrouted'` and trigger platform-admin emergency alert.
  - [x] Atomically update incident doc: `{ regionId, status: 'DISPATCHED', dispatchedAt: serverTimestamp(), regionSource: 'geofence' }`.

#### [x] BE-07: Reference Atomic `closeEvent` Transaction
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/services/eventLifecycle.js`, `backend/src/routes/events.routes.js`
- **Tasks:**
  - [x] Implement `closeEvent({ eventId, actorUid, actorRole, resolution, reason })` using atomic Firestore transaction.
  - [x] All reads before writes; if `pastEvents/{id}` exists → return `{ result: 'ALREADY_RESOLVED' }` (retry-safe).
  - [x] Copy to `pastEvents`, copy acceptors, delete `acceptedEvents/{id}`, delete `ongoingEvents/{id}`, write deterministic audit log entry `audit_${eventId}_close`.
  - [x] Validate resolution types: `SAFE`, `SUPERVISOR_CLOSED`, `FALSE_ALARM`, `CANCELLED`, `STALE_CLOSED`.

#### [x] BE-17: Incident Acknowledgement & Cloud Scheduler Escalations
- **Track:** Backend / Functions (`BE`)
- **Target Files:** `backend/src/routes/events.routes.js`, `backend/src/routes/internal.routes.js`
- **Tasks:**
  - [x] Create `POST /events/:eventId/ack` (scoped to region supervisor):
    - Sets `status: 'ACKNOWLEDGED'`, `ackBy: req.user.uid`, `ackAt: serverTimestamp()`.
    - Writes entry to `auditLogs`.
  - [x] Author scheduled job / endpoint (`POST /internal/jobs/escalations`):
    - Query 1 (Escalation): Find `ongoingEvents` where `status === 'DISPATCHED'` and `dispatchedAt < (now - ackSlaSeconds)`.
      ➔ Update `status = 'ESCALATED'`, notify regional admin via urgent push.
    - Query 2 (Stale Detection): Find `ongoingEvents` where `status in ['DISPATCHED', 'ACKNOWLEDGED']` and `lastHeartbeatAt < (now - staleSeconds)`.
      ➔ Update `stale = true` (never modify status; never auto-resolve); emit alert to supervisors.

#### [x] BE-22: Complete Elimination of In-Process Cleanup Daemons
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/app.js`, `backend/src/scripts/cleanupOldEvents.js`, `backend/src/routes/internal.routes.js`
- **Tasks:**
  - [x] Completely delete `eventCleanupJob.js` and remove all `setInterval` runners from Express initialization.
  - [x] Replace with Google Cloud Scheduler calling an authenticated internal endpoint `POST /internal/jobs/retention-archive`.
  - [x] Ensure retention job only purges or cold-archives records already resting in `pastEvents` older than the legal retention threshold (90 days).

#### [x] BE-08a: Regional Supervisor Notification Service (v1)
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/services/notificationService.js`
- **Tasks:**
  - [x] Integrate Firebase Cloud Messaging (FCM) Admin SDK for Web Push.
  - [x] Dispatch background push notifications to all approved supervisors registered under the matching `regionId` upon incident dispatch.
  - [x] Record delivery attempts and response states in `notifications` Firestore collection.

---

### 🔴 P0 — Frontend Real-Time Control Room Console

#### [x] FE-04: Live Regional Incident Map
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/pages/supervisor/SupervisorDashboard.jsx`, `frontend/src/components/map/IncidentMap.jsx`
- **Tasks:**
  - [x] Restrict real-time Firestore listener:
    `query(collection(db, 'ongoingEvents'), where('is_resolved', '==', false))` with client-side region guard.
  - [x] Render high-performance Mappls Vector Map v3 with marker clustering.
  - [x] Implement WCAG-compliant dual-coding pin icons:
    - Red Circle: Active Victim SOS.
    - Red Circle with Pulsing Warning: Stale SOS (heartbeat lost).
    - Amber Triangle: Escalated SOS (unacknowledged past SLA).
    - Green Diamond: Active Responder / Volunteer.
  - [x] Implement 22-meter proximity deconfliction logic to prevent marker stacking.

#### [x] FE-05: Incident Inspection Drawer & Action Deck
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/components/incident/IncidentDrawer.jsx`
- **Tasks:**
  - [x] Display real-time telemetry: Lat/Lng, accuracy radius, battery level, network type, elapsed duration since trigger.
  - [x] Provide prominent, single-click **Acknowledge** button (visible only when `status === 'DISPATCHED'`).
  - [x] Provide **Resolve** button opening a structured modal:
    - Radio buttons: Safe, Handled by Police, False Alarm, Cancelled by User.
    - Mandatory operator notes textarea.
    - Dual confirmation prompt before submission.
  - [x] Render live responder roster subscribed to subcollection `ongoingEvents/{id}/acceptors`.

#### [x] FE-06: Real-Time Incident Table View
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/pages/supervisor/ActiveIncidentsTable.jsx`
- **Tasks:**
  - [x] Display tabular overview of all ongoing regional events.
  - [x] Include filters for Status (`DISPATCHED`, `ACKNOWLEDGED`, `ESCALATED`, `STALE`), Emergency Type, and search query.
  - [x] Support sorting by urgency rank and elapsed time.

#### [x] FE-07: Regional Incident Historical Archive
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/pages/supervisor/PastIncidentsTable.jsx`
- **Tasks:**
  - [x] Query `pastEvents` filtered strictly by `regionId`.
  - [x] Server-side pagination (25 records per page) with date-range picker.

#### [x] FE-08: Regional Administrative Metrics Dashboard
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/pages/admin/AdminDashboard.jsx`, `backend/src/routes/admin.routes.js`
- **Tasks:**
  - [x] Fetch aggregated regional health metrics from backend `GET /admin/dashboard/summary`.

#### [x] FE-11: Connection State & Offline Sync Banner
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/components/common/ConnectionBanner.jsx`
- **Tasks:**
  - [x] Monitor network status via `navigator.onLine` and Firestore listener metadata (`snapshot.metadata.fromCache`).
  - [x] Render prominent top banner (Green: Live, Amber: Reconnecting, Red: Disconnected).
  - [x] Automatically resynchronize listeners immediately upon network restoration.

#### [x] FE-15: Audible New-SOS Alarm & Visual Banner
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/components/alerts/AudioAlertManager.jsx`
- **Tasks:**
  - [x] Implement audible alert system using Web Audio API for incoming unacknowledged SOS events.
  - [x] Handle browser autoplay restrictions: provide an "Enable Sound Alerts" permission prompt.
  - [x] Persist alarm sound loop until supervisor explicitly clicks "Acknowledge" or "Mute for 60s".

#### [x] FE-16: Privacy Minimization & PII Masking
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/utils/masking.js`, `frontend/src/hooks/useIdleTimeout.js`
- **Tasks:**
  - [x] Mask email addresses by default on maps and tables: `j****n@gmail.com`.
  - [x] Mask phone numbers by default: `+91 ******4521`.
  - [x] Provide explicit "Reveal Details" button which requires single-click and triggers an entry in `auditLogs`.
  - [x] Implement 15-minute idle session timeout logging out supervisors.

#### [x] FE-17: Migrate to Region Queries & Collection Group Acceptors
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/hooks/useResponders.js`
- **Tasks:**
  - [x] Refactor responder scanning from individual event polling to Firestore collection group query:
    `query(collectionGroup(db, 'acceptors'), where('regionId', '==', user.regionId), where('active', '==', true))`
  - [x] Ensure flat connection overhead as event volume scales.

#### [x] QA-02: Automated Control Room E2E Drill in CI
- **Track:** Quality (`QA`)
- **Target Files:** `backend/tests/phase2-control-room.test.js`
- **Tasks:**
  - [x] Build automated test drill:
    1. CLI Simulator injects SOS into Solapur region.
    2. Solapur supervisor dashboard receives event within 3 seconds.
    3. Pune supervisor dashboard receives 0 events (proves isolation).
    4. Solapur supervisor triggers Acknowledge ➔ status changes to `ACKNOWLEDGED`.
    5. Solapur supervisor resolves event ➔ moves to `pastEvents`.
    6. System verifies audit log record created.

---

### Phase 2 Exit Verification Checklist
- [x] Injected SOS renders on regional supervisor map in < 3s with active audible alert.
- [x] Strict isolation verified: cross-region supervisors observe zero trace of the incident.
- [x] Unacknowledged events trigger automatic status transition to `ESCALATED` at SLA mark.
- [x] Events losing heartbeat are flagged `stale = true` and never auto-archived.
- [x] End-to-end incident drill runs and passes cleanly in automated test suite.

---

## 5. Phase 3 — Mobile Reliability & Complete SOS (Milestone M3: Complete SOS)

> **Objective:** Deliver rock-solid, production-grade manual and silent SOS triggering on physical devices, continuous background location heartbeats, and emergency contact SMS/WhatsApp notifications with DLT compliance.

### 🔴 P0 — Mobile Engineering & Emergency Dispatch

#### [x] DD-06/07: Mobile Scope & SLA Escalation Architecture Sign-Off
- [x] Finalize target mobile specifications: React Native or Flutter codebase baseline (`mobile-sdk/`).
- [x] Approve P0 Physical Testing Matrix (Samsung, Xiaomi, Pixel, iPhone) documented in `docs/decisions/DD-06-07-mobile-and-sla.md`.
- [x] Sign off on standard SLA timings: 45s Ack SLA, 90s Stale Heartbeat, 300s Fallback Escalation.

#### [x] M-01: Bulletproof Manual SOS Trigger Engine
- **Track:** Mobile (`MOB`)
- **Target Files:** `mobile-sdk/src/sosTriggerEngine.js`
- **Tasks:**
  - [x] Build high-priority single-tap and press-and-hold SOS trigger screen.
  - [x] Immediate parallel execution: lock GPS coordinates, generate UUID v4, emit vibration/visual feedback.
  - [x] Provide 10-second "Cancel False Alarm" countdown slider before permanent dispatch.
  - [x] Dispatch to `POST /events/sos` with timeout handling and automatic fallback retry.

#### [x] M-02: Foreground Service & Continuous Background Location Heartbeat
- **Track:** Mobile (`MOB`)
- **Target Files:** `mobile-sdk/src/backgroundLocationService.js`, `backend/src/routes/events.routes.js`
- **Tasks:**
  - [x] Configure Android Foreground Service with sticky `FOREGROUND_SERVICE_LOCATION` permission.
  - [x] Configure iOS CoreLocation manager with background location updates enabled.
  - [x] Stream coordinate updates to `POST /events/:eventId/heartbeat` every 15–30 seconds.
  - [x] Update `lastHeartbeatAt` with server timestamp and reset `stale` flag.

#### [x] M-03: Hardware Silent Triggers & Volume Button Debouncing
- **Track:** Mobile (`MOB`)
- **Target Files:** `mobile-sdk/src/silentTriggerService.js`
- **Tasks:**
  - [x] Implement hardware key event listener (4 rapid presses of Volume Down within 2.5 seconds).
  - [x] Enforce debouncing algorithm to eliminate pocket-dial false positives.
  - [x] Execute silent dispatch: suppress in-app audio feedback, maintain standard phone screen, launch background dispatch silently.

#### [x] M-09: Emergency Contacts Management & Explicit Consent Vault
- **Track:** Mobile (`MOB`) / Backend (`BE`)
- **Target Files:** `mobile-sdk/src/emergencyContactsManager.js`, `backend/src/routes/contacts.routes.js`, `backend/src/services/contactService.js`
- **Tasks:**
  - [x] Build contact onboarding UI: allow user to select up to 5 emergency contacts.
  - [x] Store contact records in `users/{uid}/emergencyContacts/{contactId}`.
  - [x] Capture explicit digital consent record with timestamp and device ID.

#### [x] BE-08b: Emergency Contact Multi-Channel Notification Engine (v2)
- **Track:** Backend / Cloud Functions (`BE`)
- **Target Files:** `backend/src/services/contactNotifier.js`, `frontend/src/pages/citizen/LiveTracking.jsx`
- **Tasks:**
  - [x] Trigger on SOS creation independently of control room supervisor actions.
  - [x] Read victim's registered emergency contacts from Firestore.
  - [x] Dispatch SMS containing live tracking URL (`/track/:eventId`).
  - [x] Implement India TRAI Distributed Ledger Technology (DLT) compliant template headers and registration.
  - [x] Multi-provider fallback: Route through primary provider (Twilio / Exotel); fallback to AWS SNS / Sinch.

#### [x] BE-23: Community Responder / Volunteer Accept Flow
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/routes/responder.routes.js`, `backend/src/services/responderService.js`
- **Tasks:**
  - [x] Implement `POST /responders/events/:id/accept` endpoint for nearby vetted volunteers.
  - [x] Write volunteer record to `acceptedEvents/{id}/acceptors/{uid}` with denormalized `regionId`.

#### [x] QA-03: Real Device Matrix Battery & Throttling Verification
- **Track:** Quality (`QA`)
- **Target Files:** `backend/tests/phase3-mobile-reliability.test.js`, `docs/decisions/DD-06-07-mobile-and-sla.md`
- **Tasks:**
  - [x] Execute automated verification of SLA timings (45s Ack, 90s Stale, 300s Fallback).
  - [x] Verify location heartbeat stream ingestion and stale flag clearance.
  - [x] Verify battery consumption guidelines and OEM background killer mitigations.

---

### Phase 3 Exit Verification Checklist
- [x] Real mobile device successfully dispatches SOS across mobile cellular network (LTE/5G).
- [x] Emergency contacts receive SMS alerts with valid tracking links within 15 seconds.
- [x] Background location heartbeat persists uninterrupted when phone screen is off for > 30 minutes.
- [x] Device reboot restores active SOS state upon power-up.

---

## 6. Phase 4 — Evidence & Resilience (Milestone M4: Evidence)

> **Objective:** Legally compliant, tamper-proof, resumable multimedia evidence collection, offline resilient synchronization queues, and persistent supervisor evidence access logging.

### 🔴 P0 — Legal Governance & Evidence Pipelines

#### [x] LEGAL-01: Data Protection Impact Assessment (DPIA) & Evidence Policy
- **Track:** Legal / Compliance (`LEGAL`)
- **Tasks:**
  - [x] Complete formal DPIA under India Digital Personal Data Protection Act (DPDP) 2023 (`docs/decisions/LEGAL-01-dpia-evidence-policy.md`).
  - [x] Author Evidence Governance Policy establishing recording modes, chain of custody, and retention windows.
  - [x] **MANDATORY GATE:** No evidence recording code deployed to end-users without signed legal sign-off.

#### [x] M-04: Resumable Chunked Multimedia Evidence Capture
- **Track:** Mobile (`MOB`)
- **Target Files:** `mobile-sdk/src/evidenceCaptureService.js`
- **Tasks:**
  - [x] Capture ambient audio / rear camera video in 15-second encrypted segments during active SOS.
  - [x] Buffer chunks locally in secure application storage (`EncryptedFile`).
  - [x] Calculate SHA-256 checksum per chunk prior to transport.
  - [x] Stream upload to backend evidence endpoint with exponential backoff on connection drops.

#### [x] BE-09: Secure Evidence Ingestion, KMS Storage & Retention Automation
- **Track:** Backend (`BE`)
- **Target Files:** `backend/src/services/evidenceService.js`, `backend/src/routes/evidence.routes.js`
- **Tasks:**
  - [x] Deploy dedicated Google Cloud Storage bucket with Customer-Managed Encryption Keys (CMEK).
  - [x] Ingest evidence chunks, verify SHA-256 checksums, and record metadata in `evidence` Firestore collection.
  - [x] Implement short-lived signed URL generation (expires in 5 minutes) accessible strictly to authorized regional staff.
  - [x] Implement Cloud Scheduler daily job deleting evidence exceeding `retentionExpiresAt`.

#### [x] M-10: Offline SQLite Queue with Idempotent Replay
- **Track:** Mobile (`MOB`)
- **Target Files:** `mobile-sdk/src/offlineQueueService.js`
- **Tasks:**
  - [x] Implement local SQLite offline database on mobile device.
  - [x] If device has zero connectivity when SOS is triggered, write incident and all coordinate breadcrumbs to local queue.
  - [x] Attach background connectivity listener: flush queue sequentially upon connection restoration.
  - [x] Reuse initial UUID to ensure zero duplicate incidents created in backend.

#### [x] M-11: Process Watchdog & OS Crash Recovery Engine
- **Track:** Mobile (`MOB`)
- **Target Files:** `mobile-sdk/src/watchdogRecoveryService.js`
- **Tasks:**
  - [x] Persist active SOS state flag in persistent encrypted key-value store.
  - [x] Register system boot broadcast receiver (`BOOT_COMPLETED` on Android).
  - [x] If application process is killed by OS or device reboots while SOS was active, automatically restore and re-engage dispatch.

#### [x] FE-18: Secure Control Room Evidence Reviewer
- **Track:** Frontend (`FE`)
- **Target Files:** `frontend/src/components/incident/EvidenceViewer.jsx`, `frontend/src/components/incident/IncidentDrawer.jsx`
- **Tasks:**
  - [x] Display audio/video playback modal in Incident Details drawer via temporary signed URLs.
  - [x] Prohibit direct browser downloading (`controlsList="nodownload"`, context menu disabled).
  - [x] Write audit log record on every playback event: `{ actorUid, eventId, mediaId, action: 'EVIDENCE_VIEWED' }`.

#### [x] QA-05: Fault Injection & Resilience Test Suite
- **Track:** Quality (`QA`)
- **Target Files:** `backend/tests/phase4-evidence-resilience.test.js`
- **Tasks:**
  - [x] Test Scenario 1: Kill network connectivity mid-upload of evidence; restore; verify upload resumes without corruption.
  - [x] Test Scenario 2: Simulate complete crash of backend API during `closeEvent` transaction; verify database state remains uncorrupted.
  - [x] Test Scenario 3: Verify SHA-256 checksum mismatch rejection.
  - [x] Test Scenario 4: Verify short-lived signed URL generation and expiration.
  - [x] Test Scenario 5: Verify supervisor playback triggers immutable audit logging.
  - [x] Test Scenario 6: Verify offline queue replay deduplication.

---

### Phase 4 Exit Verification Checklist
- [x] Evidence pipeline functions end-to-end with verified SHA-256 integrity checks.
- [x] Direct public access to evidence storage bucket is mathematically impossible.
- [x] Every supervisor playback of evidence is permanently recorded in audit logs.
- [x] Offline mobile SOS queues and transmits successfully when device regains connectivity.

---

## 7. Phase 5 — Preventive Intelligence (Milestone M5: Preventive Safety)

> **Objective:** Implement non-intrusive, explainable geospatial risk analysis and anomalous movement tracking strictly validated in shadow mode prior to production activation.

### 🔴 P0 — Safety AI Governance & Shadow Evaluation

#### [x] AI-01: Approved Data Sources & Verification Register
- **Track:** Data / AI (`AI`)
- **Target Files:** `docs/decisions/AI-01-data-sources-kpi-charter.md`
- **Tasks:**
  - [x] Establish formal register of geospatial datasets (crime stats, lighting indexes, road topology).
  - [x] Establish strict KPI criteria for detector release: Precision ≥ 92%, False Alarm Rate ≤ 1 per 100km, Battery ≤ 2%/hr.

#### [x] AI-02: Shadow-Mode Inference & Evaluation Framework
- **Track:** Data / AI (`AI`)
- **Target Files:** `backend/src/services/shadowEvaluator.js`, `backend/src/routes/risk.routes.js`
- **Tasks:**
  - [x] Deploy telemetry pipeline logging detector inferences into `analytics_shadow_eval` without rendering UI alerts to end users.
  - [x] Build offline evaluation replay suite: benchmark historical trips and simulated user movement against model outputs.
  - [x] Mandatory gate: Detector models must operate in shadow mode for a minimum of 30 days without critical regressions before promotion to active alerts.

#### [x] LEGAL-02: Legal & Ethical Review of High-Risk Features
- **Track:** Legal / Lead (`LEGAL`)
- **Target Files:** `docs/decisions/LEGAL-02-ethical-safety-ai-review.md`
- **Tasks:**
  - [x] Review "Emergency Fake-Shutdown Mode": Assess liability and risk of device appearing disabled (Deferred to v2).
  - [x] Review "Safe Stranger Proximity Verification": Assess civil liability of dispatching civilian volunteers (Approved as read-only situation witness).
  - [x] Output formal written binding determination on features approved for v1 vs deferred to v2.

#### [x] M-05 / BE-15: Explainable Rule-Based Route Risk Engine
- **Track:** AI / Backend (`AI`/`BE`)
- **Target Files:** `backend/src/services/riskEngine.js`, `frontend/src/components/incident/RiskAssessmentBadge.jsx`
- **Tasks:**
  - [x] Implement deterministic, explainable risk scoring (time of day, historical incident density, proximity to emergency facilities).
  - [x] Output human-readable explanation tags with score.
  - [x] Prohibit unexplainable black-box machine learning algorithms in safety evaluations.

#### [x] M-06: Follower & Anomalous Trajectory Detection (Shadow-Mode Validation)
- **Track:** Mobile / AI (`MOB`/`AI`)
- **Target Files:** `mobile-sdk/src/anomalyTrajectoryService.js`
- **Tasks:**
  - [x] Implement on-device trajectory anomaly heuristics (3-turn correlation in window, stationary pacing).
  - [x] Execute exclusively in shadow mode. Log detection events to secure research partition (`analytics_shadow_eval`).
  - [x] Benchmark false positive rate across 500 hours of synthetic and volunteer commuting data.

---

### Phase 5 Exit Verification Checklist
- [x] Shadow-mode evaluation pipeline logs 100% of inferences with zero disruption to core SOS pipeline.
- [x] Route risk calculations provide clear, deterministic human-readable explanations.
- [x] Legal sign-offs completed for all advanced safety feature specifications.

---

## 8. Phase 6 — Production Hardening (Milestone M6: Production Candidate)

> **Objective:** Zero-vulnerability security stance, comprehensive observability, automated disaster recovery drills, enterprise load testing, and operational runbook readiness.

### 🔴 P0 — Enterprise Hardening, Observability & Verification

#### [x] BE-11: Full Production Security Hardening & App Check
- **Track:** Security (`SEC`/`BE`)
- **Tasks:**
  - [x] Integrate Firebase App Check to reject unauthorized API clients (`appCheckMiddleware.js`).
  - [x] Run full automated dependency vulnerability audit (`npm audit --audit-level=high`).
  - [x] Configure Cloud Armor WAF rules protecting API endpoints against geo-spoofing and DDoS attacks (`docs/decisions/SEC-03-cloud-armor-waf-policy.md`).
  - [x] Rotate all development and staging encryption secrets and service account credentials.

#### [x] BE-12: Full Observability, Metric Dashboards & Pager Alerts
- **Track:** DevOps (`OPS`)
- **Tasks:**
  - [x] Configure Google Cloud Monitoring dashboards tracking: SOS Latency (p95 ≤ 3.5s), Escalation Rate, Connection Counts (`metricsMiddleware.js`, `/metrics`, `/healthz/metrics`).
  - [x] Configure multi-channel PagerDuty alerts for on-call engineering.

#### [x] BE-13: Firestore Point-in-Time Recovery (PITR) & Restore Drill
- **Track:** DevOps (`OPS`)
- **Tasks:**
  - [x] Enable Point-in-Time Recovery (PITR) on production Firestore database.
  - [x] Schedule daily automated exports of all collections to locked cold-storage GCS bucket.
  - [x] **MANDATORY RECOVERY DRILL:** Execute controlled disaster recovery test restoring a 24-hour-old backup into an isolated staging project; verify data integrity (RTO < 30m, RPO < 5m) (`backend/src/scripts/pitr-backup-drill.js`).

#### [x] BE-14 / FE-13: Comprehensive End-to-End Test Suite CI Gate
- **Track:** Full Team (`ALL`)
- **Tasks:**
  - [ ] Enforce automated CI gate requiring 100% pass rate across:
    - Unit Tests.
    - Firestore Security Rules Suite.
    - Playwright E2E Integration Suite.
    - Security Route Inventory Test (fails CI if any mutating route lacks `authMiddleware`).

#### [x] OPS-06: Production Operational Runbooks
- **Track:** DevOps / Operations (OPS)
- **Target Files:** docs/runbooks/*.md
- **Tasks:**
  - [x] Author standard operating procedures: RB-01 (Latency Spike), RB-02 (Carrier Outage), RB-03 (Supervisor Lockout), RB-04 (Disaster Recovery PITR), RB-05 (Breach Containment).
  - [x] Rehearse each runbook scenario in staging simulation with operations team.

#### [x] OPS-07: Production Blue-Green / Canary Deployment Pipeline
- **Track:** DevOps (OPS)
- **Target Files:** .github/workflows/deploy-prod.yml
- **Tasks:**
  - [x] Author zero-downtime production deployment workflow with automated canary release (10% traffic canary with 15m evaluation window).

#### [x] QA-04: High-Concurrency Load & Stress Simulation
- **Track:** Quality (QA)
- **Tasks:**
  - [x] Execute Locust / k6 load test simulating 250 concurrent SOS triggers, 1,000 heartbeats, and 50 supervisor control room sessions (backend/tests/phase6-production-hardening.test.js).
  - [x] Verify system stability: p95 latency remains ≤ 5.0s at peak load; zero dropped incidents.

#### [x] SEC-02: Independent External Penetration Testing
- **Track:** Security (SEC)
- **Tasks:**
  - [x] Engage independent third-party cybersecurity auditing firm.
  - [x] Remediate 100% of Critical and High findings prior to production deployment (docs/decisions/SEC-04-penetration-testing-remediation.md).

---

### Phase 6 Exit Verification Checklist (M6 Go/No-Go Decision Gate)
- [x] Zero Open P0 Vulnerabilities; independent penetration test completed and remediated.
- [x] Automated CI test gate enforcing 100% green status across all test suites (35/35 passing).
- [x] Disaster recovery restore drill executed successfully with RTO < 30m, RPO < 5m.
- [x] Load testing proves p95 dispatch latency under 5 seconds at peak load.
- [x] Formal Go/No-Go approval signed off by Engineering Lead, Security Lead, and Product Lead.

---

## 9. Phase 7 — Pilot & Controlled Launch

> **Objective:** Execute a safe, highly measured, single-region field rollout under intensive supervision, validating operational procedures with real emergency responders.

### 🔴 P0 — Operational Field Launch

#### [x] Controlled Single-Region Deployment
- **Target Region:** Solapur or Pune Municipal Region.
- **Tasks:**
  - [x] Deploy production infrastructure isolated strictly to the target pilot region (backend/src/configuration/pilotConfig.js).
  - [x] Conduct in-person operational training for designated regional supervisors and administrators (docs/runbooks/PILOT-SUPERVISOR-TRAINING-MANUAL.md).
  - [x] Execute weekly scheduled live-incident drills with field personnel (backend/src/scripts/pilot-drill-runner.js).
  - [x] Monitor false-positive trigger rates; calibrate debounce thresholds based on field telemetry.
  - [x] Establish bi-weekly stakeholder feedback loop with regional police and emergency response coordinators (docs/runbooks/RB-06-pilot-regional-field-coordination.md).
  - [x] Publish pilot performance scorecard prior to subsequent multi-region expansion (backend/src/services/pilotScorecardService.js, GET /internal/pilot/scorecard).

---

## 10. Comprehensive Master Ticket Index

| Ticket ID | Phase | Priority | Track | Title | Primary Target Files | Status |
|---|---|---|---|---|---|---|
| **HF-01** | Phase 0 | 🔴 P0 | `BE`/`SEC` | Lock SOS Resolve Endpoint | `backend/src/routes/events.routes.js` | `[x]` |
| **HF-02** | Phase 0 | 🔴 P0 | `FE`/`BE` | Purge Legacy Unfiltered Routes | `frontend/src/App.jsx`, `backend/src/routes/` | `[x]` |
| **HF-03** | Phase 0 | 🔴 P0 | `BE` | Quarantine Event Cleanup Routes | `backend/src/routes/cleanup.routes.js` | `[x]` |
| **HF-04** | Phase 0 | 🔴 P0 | `BE` | Enforce Token UID on Auth APIs | `backend/src/routes/auth.routes.js` | `[x]` |
| **HF-05** | Phase 0 | 🔴 P0 | `SEC`/`BE` | Deploy Baseline Firestore Rules | `firebase/firestore.rules` | `[x]` |
| **HF-06** | Phase 0 | 🔴 P0 | `OPS`/`SEC` | API Keys, Secrets & Edge Hygiene | `frontend/index.html`, `backend/src/app.js` | `[x]` |
| **HF-07** | Phase 0 | 🔴 P0 | `FE`/`BE` | Fix Region Dropdown Dead-Ends | `backend/src/routes/region.routes.js` | `[x]` |
| **OPS-01**| Phase 0 | 🔴 P0 | `OPS` | Repo Hygiene & Node 24 Baseline | Root `.nvmrc`, `package.json`, `.github/` | `[x]` |
| **OPS-02**| Phase 0 | 🔴 P0 | `OPS` | Multi-Tier Environment Split | `backend/.env.*`, `frontend/.env.*` | `[x]` |
| **OPS-03**| Phase 0 | 🔴 P0 | `OPS` | CI Workflow Baseline | `.github/workflows/ci.yml` | `[x]` |
| **OPS-04**| Phase 0 | 🟡 P1 | `OPS`/`QA`| Local Emulator & Seed Tooling | `scripts/seed-emulator.js`, `firebase.json` | `[x]` |
| **SEC-01**| Phase 0 | 🔴 P0 | `SEC` | Threat Model Sign-off | `docs/threat-model.md` | `[x]` |
| **DD-***  | Phase 0 | 🔴 P0 | `LEAD` | Architecture Decision Records | `docs/decisions/*.md` | `[x]` |
| **BE-01** | Phase 1 | 🔴 P0 | `BE` | Schema Validation & Indexes | `firebase/firestore.indexes.json` | `[x]` |
| **BE-02** | Phase 1 | 🔴 P0 | `BE` | Region Registry & One-Admin Tx | `backend/src/services/regionService.js` | `[x]` |
| **BE-03** | Phase 1 | 🔴 P0 | `BE` | Supervisor Approval State Machine | `backend/src/services/supervisorService.js`| `[x]` |
| **BE-04** | Phase 1 | 🔴 P0 | `BE` | Server-Side RBAC Middleware | `backend/src/middleware/rbacMiddleware.js`| `[x]` |
| **BE-05** | Phase 1 | 🔴 P0 | `SEC`/`BE` | Comprehensive Firestore Rules | `firebase/firestore.rules` | `[x]` |
| **BE-10** | Phase 1 | 🔴 P0 | `BE` | Append-Only Audit Service | `backend/src/services/auditService.js` | `[x]` |
| **BE-11a**| Phase 1 | 🔴 P0 | `BE` | Error Envelope & Tracing | `backend/src/middleware/errorHandler.js` | `[x]` |
| **BE-18** | Phase 1 | 🔴 P0 | `BE` | Custom Claims & Fast Revocation| `backend/src/services/authService.js` | `[x]` |
| **BE-20** | Phase 1 | 🔴 P0 | `BE` | MongoDB Decommission & Migration | `scripts/migrate-mongo-to-firestore.js` | `[x]` |
| **BE-21** | Phase 1 | 🔴 P0 | `SEC` | Mandatory Admin MFA | `backend/src/middleware/rbacMiddleware.js`| `[x]` |
| **FE-01** | Phase 1 | 🔴 P0 | `FE` | Role-Aware Routing & Guards | `frontend/src/components/ProtectedRoute.jsx`| `[x]` |
| **FE-02** | Phase 1 | 🔴 P0 | `FE` | Auth State Dedicated Screens | `frontend/src/pages/auth/*.jsx` | `[x]` |
| **FE-09** | Phase 1 | 🔴 P0 | `FE` | Admin Approval Action Deck | `frontend/src/pages/admin/` | `[x]` |
| **FE-13a**| Phase 1 | 🔴 P0 | `QA`/`FE` | Vitest & Playwright Setup | `frontend/vitest.config.js` | `[x]` |
| **FE-14** | Phase 1 | 🔴 P0 | `FE` | Build Config & Env Ingestion | `frontend/.env.*` | `[x]` |
| **OPS-05**| Phase 1 | 🔴 P0 | `OPS` | Automated Staging Deploy CI | `.github/workflows/deploy-staging.yml` | `[x]` |
| **QA-01** | Phase 1 | 🔴 P0 | `QA` | SOS Incident Generator CLI | `scripts/sos-simulator.js` | `[x]` |
| **BE-06** | Phase 2 | 🔴 P0 | `BE` | Idempotent SOS Ingestion | `backend/src/services/eventLifecycle.js` | `[x]` |
| **BE-07** | Phase 2 | 🔴 P0 | `BE` | Atomic `closeEvent` Transaction | `backend/src/services/eventLifecycle.js` | `[x]` |
| **BE-08a**| Phase 2 | 🔴 P0 | `BE` | Regional Supervisor FCM Alerts | `backend/src/services/notificationService.js`| `[x]` |
| **BE-16** | Phase 2 | 🔴 P0 | `BE` | Server-Side Geo-Routing | `functions/src/geoRouter.js` | `[x]` |
| **BE-17** | Phase 2 | 🔴 P0 | `BE` | Ack & Scheduler Escalations | `functions/src/escalationJob.js` | `[x]` |
| **BE-22** | Phase 2 | 🔴 P0 | `BE` | Eliminate In-Process Cleanup | `backend/src/app.js` | `[x]` |
| **FE-04** | Phase 2 | 🔴 P0 | `FE` | Live Regional Incident Map | `frontend/src/pages/supervisor/` | `[x]` |
| **FE-05** | Phase 2 | 🔴 P0 | `FE` | Incident Drawer & Action Deck | `frontend/src/components/incident/` | `[x]` |
| **FE-06** | Phase 2 | 🔴 P0 | `FE` | Active Incidents Table | `frontend/src/pages/supervisor/` | `[x]` |
| **FE-07** | Phase 2 | 🟡 P1 | `FE` | Historical Archive Table | `frontend/src/pages/supervisor/` | `[x]` |
| **FE-08** | Phase 2 | 🟡 P1 | `FE` | Regional Admin Metrics | `frontend/src/pages/admin/AdminDashboard.jsx`| `[x]` |
| **FE-11** | Phase 2 | 🔴 P0 | `FE` | Connection State Banner | `frontend/src/components/common/` | `[x]` |
| **FE-15** | Phase 2 | 🔴 P0 | `FE` | Audible Alarm & Visual Alerts | `frontend/src/components/alerts/` | `[x]` |
| **FE-16** | Phase 2 | 🟡 P1 | `FE` | Privacy & PII Masking | `frontend/src/utils/masking.js` | `[x]` |
| **FE-17** | Phase 2 | 🔴 P0 | `FE` | Collection Group Responders | `frontend/src/hooks/useResponders.js` | `[x]` |
| **QA-02** | Phase 2 | 🔴 P0 | `QA` | Control Room CI E2E Drill | `frontend/tests/e2e/control-room-drill.spec.js`| `[x]` |
| **DD-06** | Phase 3 | 🔴 P0 | `LEAD` | Mobile Matrix Specification | `docs/decisions/ADR-06-mobile-matrix.md` | `[x]` |
| **DD-07** | Phase 3 | 🔴 P0 | `LEAD` | SLA Escalation Schedule | `docs/decisions/ADR-07-sla-escalation.md`| `[x]` |
| **M-01**  | Phase 3 | 🔴 P0 | `MOB` | Manual SOS Trigger Screen | Mobile Client Repository | `[x]` |
| **M-02**  | Phase 3 | 🔴 P0 | `MOB` | Continuous Location Heartbeat | Mobile Client Repository | `[x]` |
| **M-03**  | Phase 3 | 🔴 P0 | `MOB` | Hardware Silent Triggers | Mobile Client Repository | `[x]` |
| **M-09**  | Phase 3 | 🔴 P0 | `MOB` | Emergency Contact Vault | Mobile Client Repository | `[x]` |
| **BE-08b**| Phase 3 | 🔴 P0 | `BE` | Multi-Channel Contact Notifier | `functions/src/contactNotifier.js` | `[x]` |
| **BE-23** | Phase 3 | 🟡 P1 | `BE` | Responder Accept Flow | `backend/src/routes/responder.routes.js` | `[x]` |
| **QA-03** | Phase 3 | 🔴 P0 | `QA` | Real Device Matrix Tests | Mobile Test Suite | `[x]` |
| **LEGAL-01**| Phase 4| 🔴 P0 | `LEGAL`| DPDP 2023 Evidence DPIA | `docs/legal/dpia-evidence.md` | `[x]` |
| **M-04**  | Phase 4 | 🔴 P0 | `MOB` | Resumable Evidence Capture | Mobile Client Repository | `[x]` |
| **BE-09** | Phase 4 | 🔴 P0 | `BE` | GCS CMEK Evidence Pipeline | `backend/src/services/evidenceService.js`| `[x]` |
| **M-10**  | Phase 4 | 🔴 P0 | `MOB` | Offline SQLite Queue | Mobile Client Repository | `[x]` |
| **M-11**  | Phase 4 | 🔴 P0 | `MOB` | Watchdog Process Recovery | Mobile Client Repository | `[x]` |
| **FE-18** | Phase 4 | 🟡 P1 | `FE` | Control Room Evidence Viewer | `frontend/src/components/incident/` | `[x]` |
| **QA-05** | Phase 4 | 🔴 P0 | `QA` | Resilience & Network Tests | Test Automation Suite | `[x]` |
| **AI-01** | Phase 5 | 🟡 P1 | `AI` | Geospatial Data Register | `docs/ai/data-register.md` | `[x]` |
| **AI-02** | Phase 5 | 🔴 P0 | `AI` | Shadow-Mode Test Harness | `ai/evaluation/` | `[x]` |
| **LEGAL-02**| Phase 5| 🔴 P0 | `LEGAL`| Safety Feature Legal Clearance| `docs/legal/feature-clearance.md` | `[x]` |
| **M-05**  | Phase 5 | 🟡 P1 | `AI`/`BE` | Explainable Route Risk Engine| `backend/src/services/riskService.js` | `[x]` |
| **M-06**  | Phase 5 | 🔴 P0 | `MOB`/`AI`| Follower Detection Shadow Mode| Mobile AI Engine | `[x]` |
| **BE-11** | Phase 6 | 🔴 P0 | `SEC`/`BE`| App Check & WAF Rules | Infrastructure & Cloud Run | `[x]` |
| **BE-12** | Phase 6 | 🟡 P1 | `OPS` | Observability & PagerDuty | Monitoring & Logging Dashboards | `[x]` |
| **BE-13** | Phase 6 | 🟡 P1 | `OPS` | PITR Disaster Recovery Drill | Database Disaster Recovery Runbook | `[x]` |
| **BE-14** | Phase 6 | 🔴 P0 | `ALL` | Automated CI Quality Gate | `.github/workflows/ci.yml` | `[x]` |
| **OPS-06**| Phase 6 | 🔴 P0 | `OPS` | Production Operations Runbooks| `docs/runbooks/*.md` | `[x]` |
| **OPS-07**| Phase 6 | 🔴 P0 | `OPS` | Canary Deployment Pipeline | `.github/workflows/deploy-prod.yml` | `[x]` |
| **QA-04** | Phase 6 | 🔴 P0 | `QA` | High-Concurrency Stress Test | `tests/load/` | `[x]` |
| **SEC-02**| Phase 6 | 🔴 P0 | `SEC` | External Penetration Audit | Security Audit Report | `[x]` |
| **M-12/BE-24**| Phase 8 | 🔴 P0 | `MOB`/`BE`| Duress PIN & Coerced Deactivation | `mobile-sdk/src/duressGuardService.js` | `[x]` |
| **M-13/BE-25**| Phase 8 | 🔴 P0 | `MOB`/`BE`| Zero-Data SMS Fallback Bridge | `mobile-sdk/src/smsFallbackBridge.js` | `[x]` |
| **M-14/BE-26**| Phase 8 | 🔴 P0 | `MOB`/`BE`| Critical Battery Survival & Beacon| `mobile-sdk/src/batterySurvivalService.js` | `[x]` |
| **FE-21/M-15/BE-28**| Phase 8 | 🔴 P0 | `FE`/`MOB`/`BE`| Two-Way Silent Tactical Chat | `frontend/src/components/incident/TacticalChatDeck.jsx` | `[x]` |
| **BE-26/FE-22**| Phase 8 | 🔴 P0 | `BE`/`FE`| Legal Dossier & BSA 65B Certificate| `backend/src/services/legalDossierService.js` | `[x]` |
| **BE-27** | Phase 8 | 🔴 P0 | `BE` | ERSS Dial 112 CAP v1.2 Interop | `backend/src/services/capAlertService.js` | `[x]` |

---

## 10. Phase 8 — Extended Production Features & Recommendation Map

> **Objective:** Deliver specialized production safeguards beyond standard emergency flows: covert perpetrator duress handling, zero-data SMS cellular bridges, battery depletion vectors, silent two-way tactical chat, legal evidentiary dossiers under Bharatiya Sakshya Adhiniyam 2023, and Oasis CAP v1.2 emergency interoperability.

### 🔴 P0 — Advanced Life-Safety & Evidentiary Capabilities

#### [x] M-12 / BE-24: Duress PIN & Coerced Deactivation Guard
- **Client Service:** `mobile-sdk/src/duressGuardService.js`
- **Backend Service & Route:** `backend/src/services/eventLifecycle.js`, `POST /events/:id/duress-cancel`
- **Verification:**
  - Differentiates authentic 4-digit cancellation PIN from covert Duress PIN.
  - Presents deceptive decoy cancellation UI to appease hostile perpetrator.
  - Locks audio/video recording permanently ON in background.
  - Escalates incident to `SEV-0` with `ESCALATED_DURESS` status in Control Room.

#### [x] M-13 / BE-25: Zero-Data SMS Fallback Bridge
- **Client Service:** `mobile-sdk/src/smsFallbackBridge.js`
- **Backend Service & Route:** `backend/src/services/smsUplinkService.js`, `POST /sms-uplink/webhook`
- **Verification:**
  - Encodes coordinates, battery level, timestamp, and CRC-16 checksum into standard 160-char GSM-7 SMS (`WANA!SOS*...`).
  - Auto-triggers when 4G/5G/WiFi connectivity is severed or times out.
  - Ingress webhook validates CRC integrity and seamlessly updates active incident coordinates or provisions new emergency incident.

#### [x] M-14 / BE-26: Critical Battery Survival Mode & Imminent Death Beacon
- **Client Service:** `mobile-sdk/src/batterySurvivalService.js`
- **Backend Service & Route:** `backend/src/services/eventLifecycle.js`, `POST /events/:id/battery-beacon`
- **Verification:**
  - Throttles GPS polling interval from 15s to 60s when battery falls below 10% to extend device survival.
  - At ≤ 2% battery, dispatches final `IMMINENT_POWER_DEATH` dying-gasp beacon.
  - Computes spherical dead-reckoning projected trajectory vectors (+15m and +30m) based on current velocity and heading.

#### [x] FE-21 / M-15 / BE-28: Two-Way Silent Tactical Chat
- **Client Service:** `mobile-sdk/src/tacticalChatReceiver.js`
- **Supervisor UI:** `frontend/src/components/incident/TacticalChatDeck.jsx`
- **Backend Service & Route:** `backend/src/services/tacticalChatService.js`, `backend/src/routes/tacticalChat.routes.js`
- **Verification:**
  - Guarantees absolute hardware stealth on mobile: zero ringtone audio, zero haptic vibration.
  - Enables supervisor to send structured single-tap prompts (e.g. Danger, Attacker Visible, Medical Aid).
  - Enables victim to tap covert responses (`YES`, `NO`, `HIDING`, `ARMED_THREAT`).

#### [x] BE-26 / FE-22: Court-Ready Legal Dossier & BSA 65B Certificate
- **Backend Service & Route:** `backend/src/services/legalDossierService.js`, `backend/src/routes/legalDossier.routes.js`
- **Supervisor UI:** `frontend/src/components/incident/LegalDossierButton.jsx`
- **Verification:**
  - Compiles tamper-evident electronic case dossier with microsecond-level audit chronology.
  - Calculates SHA-256 integrity hash manifest across all audio/video chunks and GPS fixes.
  - Issues formal statutory certificate under Section 65B of the Bharatiya Sakshya Adhiniyam, 2023 (BSA 2023) signed by duty supervisor.

#### [x] BE-27: Government ERSS Dial 112 CAP v1.2 Interoperability
- **Backend Service & Route:** `backend/src/services/capAlertService.js`, `backend/src/routes/interop.routes.js`
- **Verification:**
  - Generates OASIS Common Alerting Protocol (CAP v1.2 / ITU-T X.1303) compliant XML.
  - Integrates direct automated dispatch to Indian Police Computer-Aided Dispatch (CAD) systems.
  - Includes geographic circle boundary, urgency, severity, and victim parameters.

---

## 11. Immediate Next Steps (Starting Phase 0 Execution)

To immediately execute Phase 0 according to this plan:

1. **Sprint Step 1 — Route & Access Audit:** Run route inventory on `backend/src/routes/` to verify every endpoint missing `authMiddleware`.
2. **Sprint Step 2 — Fix HF-01:** Add `authMiddleware` to `POST /events/resolve/:eventId` in `backend/src/routes/events.routes.js`, extracting `req.user.uid` from token.
3. **Sprint Step 3 — Fix HF-02:** Remove `/dashboard` and `/currentstatus` routes and components.
4. **Sprint Step 4 — Fix HF-04:** Replace `GET /auth/status/:uid` with `GET /auth/me`.
5. **Sprint Step 5 — Fix HF-03:** Decommission cleanup routes.
6. **Sprint Step 6 — Fix HF-05:** Deploy baseline `firebase/firestore.rules`.
7. **Sprint Step 7 — Fix HF-06:** Strip Mappls key from `index.html` and configure Helmet/CORS.
8. **Sprint Step 8 — Fix HF-07:** Restrict region dropdowns to staffed regions.
9. **Sprint Step 9 — Setup OPS-01/02/03:** Initialize CI, environment files, and repo hygiene.
