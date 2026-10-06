# AI-01: Approved Data Sources & Verification Register (Safety AI Governance Charter)

**Status:** APPROVED  
**Date:** 2026-10-06  
**Target Milestone:** Milestone M5 (Preventive Safety)  
**Authors:** WANA Safety AI Working Group & Legal Governance Committee  

---

## 1. Purpose & Core Governance Philosophy

Preventive safety intelligence in emergency systems poses unique ethical and life-safety risks. False positives generate anxiety, fatigue, and unnecessary dispatch mobilization; false negatives leave citizens vulnerable.

The WANA Preventive Intelligence Engine adheres to three non-negotiable principles:
1. **Explainability Over Black Boxes:** No opaque, unexplainable machine learning weights shall make autonomous life-safety determinations. All risk assessments must provide deterministic, human-readable explanatory tags.
2. **Shadow-Mode Before Production:** Every new algorithmic detector must undergo a mandatory **minimum 30-day shadow evaluation** recording predictions to `analytics_shadow_eval` without surfacing disruptive alarms to citizens.
3. **No Automated Downgrade:** An AI risk engine can upgrade priority or suggest monitored trips, but **can never close, reject, or downgrade an active SOS incident raised by a citizen**.

---

## 2. Approved Geospatial Data Sources Register

| Data Source ID | Category | Provider / Source | Update Cadence | Verification & Privacy Guardrails |
|---|---|---|---|---|
| `GEO-MNG-01` | Base Road Network & Turn Topology | MapmyIndia (Mappls) Navigation API | Weekly | Restricted API keys; zero citizen PII forwarded in route queries |
| `GEO-POI-02` | Verified Emergency Facilities | Maharashtra State Police, Municipal Corporations (PMC, SMC) | Monthly | Ground-truthed coordinates of 24/7 manned police stations, public hospitals, and safe kiosks |
| `HIST-INC-03` | Historical Incident Density | WANA De-identified `pastEvents` Vault | Nightly Aggregation | Privacy k-anonymity (k >= 5); aggregated into 250m x 250m geohash grids; zero individual victim identities |
| `ENV-LGT-04` | Street Lighting & Visibility Index | Smart City Municipal IoT Feeds / Astronomical Solar Tables | Real-time / Daily | Solar dusk-to-dawn astronomical calculation combined with municipal streetlight status |

---

## 3. Strict Algorithmic Release KPI Gates

Before any detector model or heuristic is promoted from shadow mode to live citizen alerting, it must demonstrably satisfy the following empirical thresholds across a minimum of 500 hours of simulated and volunteer commuting data:

| Metric | Target KPI Threshold | Measurement Protocol |
|---|---|---|
| **Precision** | ≥ 92.0% | True positives / (True positives + False positives) |
| **False Alarm Rate (FAR)** | ≤ 1.0 per 100 km | Benchmarked against normal urban and suburban commutes |
| **On-Device Battery Impact** | ≤ 2.0% battery drain / hr | Measured with screen off and background location sampling |
| **Inference Latency** | ≤ 150 ms (p95) | On-device execution budget |
| **Explanation Completeness** | 100.0% | Every score must have at least one valid human-readable tag |

---

## 4. Shadow Evaluation Protocol (AI-02)

1. The client runs trajectory and anomaly evaluation locally in a background worker thread.
2. When an anomaly threshold is reached, telemetry is written to `POST /risk/shadow-eval`.
3. The event is stored in Firestore collection `analytics_shadow_eval`:
   - `tripId` (random ephemeral ID)
   - `detectorVersion`
   - `heuristicMetrics` (turn counts, pacing interval, speed variance)
   - `timestamp`
4. The citizen UI remains entirely unaffected. No notifications or disruptive sirens are triggered until the model graduates through the release gate.
