# LEGAL-02: Legal & Ethical Review of High-Risk Safety AI Features

**Status:** BINDING DETERMINATION  
**Date:** 2026-10-06  
**Jurisdiction:** Republic of India — Bharatiya Nyaya Sanhita 2023, Information Technology Act 2000, DPDP Act 2023  
**Target Milestone:** Milestone M5 (Preventive Safety)  
**Authors:** WANA Chief Legal Officer & Safety Advisory Board  

---

## 1. Executive Summary

As part of Milestone M5 (Preventive Safety), an exhaustive legal, ethical, and civil liability assessment was conducted on three proposed high-risk features:
1. **Feature A: "Emergency Fake-Shutdown Mode"** (Software simulation of a powered-off device).
2. **Feature B: "Safe Stranger Proximity Dispatch"** (Alerting nearby civilian volunteers to an ongoing physical confrontation).
3. **Feature C: "Autonomous AI Incident Resolution & Severity Downgrading"**.

This document issues formal, binding determinations for the product and engineering roadmap.

---

## 2. Binding Feature Determinations

### 2.1 Feature A: "Emergency Fake-Shutdown Mode" ➔ 🚫 DEFERRED TO V2
- **Proposed Mechanism:** When an assailant demands the victim turn off their phone, a fake shutdown animation plays, the screen stays dark, and touch inputs are ignored while background tracking continues.
- **Identified Failure Modes & Liability:**
  1. *Emergency Service Lockout:* If an assailant departs and the victim attempts to dial national emergency 112, an unresponsive "fake-off" state could delay actual rescue.
  2. *OS Incompatibility:* Modern Android and iOS systems aggressively throttle non-foreground applications when the display pipeline is killed without official system shutdown.
  3. *Assailant Detection:* Backlight bleed or haptic vibration could alert the assailant to the deception, aggravating physical retaliation.
- **Binding Determination:** **DEFERRED TO V2 RESEARCH**. In v1, silent protection is achieved exclusively via `M-03` (4x Volume Down hardware trigger), maintaining ordinary screen behavior with zero in-app audio feedback.

---

### 2.2 Feature B: "Community Responder Volunteer Dispatch" ➔ ⚠️ CONDITIONALLY APPROVED (READ-ONLY)
- **Proposed Mechanism:** When an SOS is triggered, nearby registered citizens receive an alert to intervene.
- **Identified Failure Modes & Liability:**
  1. *Vigilante Liability:* Dispatching untrained citizens into active violent assaults risks physical injury, death, or unlawful vigilante altercations. Under Indian tort law, the platform could face severe vicarious liability for negligent dispatch.
  2. *Secondary Victimization:* Assailants could ambush responding volunteers.
- **Binding Determination:** **APPROVED STRICTLY AS SITUATIONAL WITNESS & MEDICAL FIRST-AID NOTIFICATION**.
  - Volunteers (`acceptedEvents`) receive route coordinates only with the status `EN_ROUTE`.
  - In-app safety guidelines strictly mandate: *"Do not engage assailants. Maintain a safe distance, observe from safety, and assist emergency medical personnel."*
  - The platform **never substitutes civilian volunteers for official law enforcement (Police 112 / Ambulance 108)**.

---

### 2.3 Feature C: "Autonomous AI Incident Resolution / Downgrading" ➔ ⛔ STRICTLY PROHIBITED
- **Proposed Mechanism:** Machine learning models downgrading or resolving incidents if movement returns to normal.
- **Identified Failure Modes & Liability:**
  - An assailant could force the victim to walk at a normal pace or drive in a regular trajectory while under duress. An automated downgrade could lead to catastrophic loss of life.
- **Binding Determination:** **PERMANENT ARCHITECTURAL PROHIBITION**.
  - All emergency resolution requires explicit human intervention: either the authenticated victim via `SAFE` resolution or an authorized regional supervisor with mandatory resolution notes (`BE-07`).
  - AI risk scores can only *elevate* attention, never reduce it.

---

## 3. Compliance Sign-Off Table

| Evaluated Feature | Determination | Required Engineering Guardrails |
|---|---|---|
| Fake-Shutdown Mode | **DEFERRED (V2)** | Feature flags disabled in production builds; only M-03 silent hardware trigger enabled |
| Civilian Responder Network | **APPROVED (READ-ONLY)** | BE-23 accept flow enforces non-combatant safety advisories; police dispatch mandatory |
| AI Automated Incident Downgrade | **PROHIBITED** | Hard-coded constraint in state machine: status transitions to RESOLVED require human actor UID |
