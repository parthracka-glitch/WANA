# WANA Regional Supervisor Operational Training Manual

**Target Audience:** Regional Control Room Supervisors & Municipal Administrators  
**Region Deployment:** Solapur Central & Pune Pilot Zones  
**Version:** 1.0.0-PROD-PILOT  

---

## Module 1: System Access, Authentication & MFA
1. **Navigating to Console:** Access the secure control room at `https://admin.wana.in`.
2. **Identity Verification:**
   - Log in using your authorized government/municipal email address.
   - Complete mandatory Multi-Factor Authentication (MFA) via TOTP authenticator app or hardware FIDO2 key.
3. **Audio Alert Activation Gesture:**
   - Modern web browsers prohibit audio playback without explicit user interaction.
   - Upon initial dashboard load, click the **"Enable Emergency Audio Alerts"** prompt in the header.
   - Verify the audio test chime confirms the hardware speaker is active.

---

## Module 2: Situational Awareness & Connection Monitoring
1. **Connection State Banner (`FE-11`):**
   - 🟢 **LIVE:** WebSocket and Firestore listeners connected with real-time updates.
   - 🟡 **RECONNECTING:** Network latency or connectivity drop detected. Do NOT refresh the page; automatic exponential backoff will reconnect.
   - 🔴 **STALE DATA:** Disconnection exceeded 30 seconds. Audio alarm sounds. Follow runbook `RB-01`.
2. **Geographic Map Workspace (`FE-04`):**
   - Live incidents appear as red pulsing markers with proximity deconfliction (~22m).
   - Click any marker to open the Incident Action Deck (`FE-05`).

---

## Module 3: Incident Lifecycle & SLA Targets
Every incoming SOS trigger initiates an SLA clock:

| SLA Milestone | Target Duration | Protocol Action |
|---|---|---|
| **Acknowledgment (ACK)** | **≤ 60 Seconds** | Click **Acknowledge** button immediately upon alarm to claim ownership. |
| **Dispatch Latency** | **≤ 3,500 Milliseconds** | Monitored automatically via backend telemetry. |
| **False-Alarm Window** | **10 Seconds** | Mobile user can cancel accidental triggers; event is tagged `FALSE_ALARM_USER_CANCELLED`. |
| **Escalation Threshold** | **> 60s without ACK** | Event transitions to `ESCALATED`; administrative SMS and PagerDuty alert fires. |

---

## Module 4: Privacy Minimization & PII Access (`FE-16`)
1. **Default Masking:** Contact details, phone numbers, and full names are masked by default (e.g., `+91 98****3210`, `a***@example.com`).
2. **Unmasking Justification:**
   - Click the eye icon next to a masked field only when calling the victim or dispatching field responders.
   - Every unmask event is cryptographically recorded in `audit_logs` with your supervisor UID, timestamp, and client IP.

---

## Module 5: Secure Evidence Review (`FE-18`)
1. **Audio/Video Playback:**
   - Click **Review Evidence** in the Incident Drawer.
   - Media streams via short-lived signed URLs expiring in 5 minutes.
   - Local browser downloading is disabled.
2. **Chain of Custody:**
   - Every playback session writes an immutable `EVIDENCE_VIEWED` entry to the tamper-evident audit log.
   - Share evidence only with authorized investigating officers under BNSS / IT Act evidentiary procedures.

---

## Module 6: Incident Resolution Codes
Incidents must NEVER be left unresolved or silently deleted. Allowed resolution states:
1. `RESOLVED_ASSISTED`: PCR van, beat police, or field responders successfully reached victim and provided physical assistance.
2. `RESOLVED_SAFE`: Victim verified safe via phone call or emergency contact confirmation.
3. `FALSE_ALARM`: Verified accidental activation (pocket tap, child play) outside the 10-second window.

---

## Module 7: Shift Handover & Security Audits
1. **End-of-Shift Checklist:**
   - Ensure zero unacknowledged or unclosed incidents in your queue.
   - Brief the incoming on-duty supervisor on any active `ESCALATED` or `STALE` situations.
   - Click **Sign Out** to revoke active session tokens.
2. **Weekly Drills:**
   - Supervisors participate in the scheduled Wednesday 14:00 IST simulated field drills.
   - Results are graded via the Pilot Performance Scorecard.
