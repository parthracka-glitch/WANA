# Runbook RB-06: Pilot Regional Field Coordination & Police/ERSS Protocol

## 1. Operational Scope & Legal Context
- **Target Pilot Zone:** Solapur Municipal Corporation (Central Control Room).
- **Core Principle:** WANA is an auxiliary situational awareness platform that **complements**—and does not replace—statutory emergency services (Dial 112 / Emergency Response Support System - ERSS).
- **Regulatory Framework:** Indian Telegraph Act, TRAI DLT Mandates, Bharatiya Nagarik Suraksha Sanhita (BNSS) 2023.

---

## 2. Dispatch Roles & Inter-Agency Communication

| Role | Agency | Primary Responsibility | Direct Contact Rail |
|---|---|---|---|
| **WANA Regional Supervisor** | WANA Control Room | Validates live SOS telemetry, monitors breadcrumbs, triggers PCR van alert | Dedicated Console + Direct Hotline |
| **ERSS 112 Dispatch Officer** | Maharashtra Police (Solapur HQ) | Dispatches nearest Police Beat Marshall or PCR Van | Police Wireless + CAD (Computer-Aided Dispatch) |
| **Community Responder** | Vetted Civic Volunteer | Scene witness and safe proximity presence (non-tactical) | WANA Responder Mobile App (`BE-23`) |

---

## 3. Incident Lifecycle & Handover Protocol

### Phase A: Ingestion to Verification (< 30 Seconds)
1. Mobile user triggers SOS in pilot geofence (`17.6599° N, 75.9064° E`).
2. Audible chime & flashing red banner activates on WANA Supervisor console (`FE-15`).
3. Supervisor clicks **Acknowledge (ACK)** within 60 seconds (stops SLA timer).
4. Supervisor verifies location coordinates and battery level. If victim cancels within 10-second grace window, mark as `FALSE_ALARM_USER_CANCELLED` and log to audit.

### Phase B: Emergency Escalation to Police (Dial 112)
If incident is unacknowledged within 60 seconds or supervisor assesses immediate physical threat:
1. **Automated Escalation:** Backend marks event as `ESCALATED` (`BE-17`).
2. **CAD Data Relay:** Supervisor clicks **Relay to 112 CAD** on incident drawer (`FE-05`):
   - Transmits encrypted situational package: victim pseudonym, latitude/longitude, battery state, speed, nearest landmark.
3. **Hotline Handover:** Supervisor calls Solapur Police Control Room (`+91-217-2744600` / `112`) referencing WANA Incident UUID.

### Phase C: Civilian Volunteer Deconfliction
1. If citizen responders (`BE-23`) accept nearby dispatch via app:
   - Responders receive strictly read-only map marker (~22m proximity jitter for victim privacy).
   - Responders are explicitly instructed **never** to engage hostile actors; presence is strictly as a safe bystander/witness.

### Phase D: Resolution & Chain of Custody
1. Incident closure requires police confirmation or verified safe arrival:
   - Allowed resolution types: `RESOLVED_ASSISTED`, `RESOLVED_SAFE`, `FALSE_ALARM`.
2. Supervisor inputs closure narrative:
   ```json
   {
     "resolution": "RESOLVED_ASSISTED",
     "policeCadReference": "SOL-PCR-2026-8812",
     "supervisorNotes": "PCR Van 04 made physical contact at Navi Peth. Victim escorted safely home."
   }
   ```
3. Event is atomically transitioned to `past_events` with tamper-evident SHA-256 audit entry.

---

## 4. Weekly Drill Schedule & Calibrations
- **Frequency:** Every Wednesday at 14:00 IST.
- **Tooling:** Run `npm run drill:pilot` to execute simulated multi-incident load and benchmark response times against the 60s SLA.
- **Reporting:** Publish weekly scorecard (`GET /internal/pilot/scorecard`) to Municipal Police Liaison Committee.
