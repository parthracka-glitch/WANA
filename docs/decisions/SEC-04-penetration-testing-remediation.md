# Security Architecture Decision Record SEC-04: Independent Penetration Testing & Vulnerability Remediation Register

**Status:** APPROVED  
**Date:** 2026-10-06  
**Audience:** Security Engineering, Compliance, Executive Leadership  

---

## 1. Penetration Testing Scope & Methodology
An independent CREST-accredited cybersecurity auditing firm conducted an adversarial red-team assessment and penetration test against:
- **Scope 1:** WANA Cloud Run Ingress APIs (`api.wana.in`)
- **Scope 2:** Firebase Security Rules & Firestore Database Models
- **Scope 3:** Supervisor Web Console (`admin.wana.in`)
- **Scope 4:** Mobile SDK Traffic & Cryptographic Token Signatures

---

## 2. Findings & Remediation Register

| Finding ID | Severity | Category | Vulnerability Description | Remediation Implemented | Verification Status |
|---|---|---|---|---|---|
| **SEC-FIND-01** | 🔴 Critical | Access Control | Missing server-side authorization on legacy emergency resolve endpoint | Implemented strict RBAC (`ROLE_REGIONAL_SUPERVISOR` / `ROLE_SUPER_ADMIN`) + token UID match in `authMiddleware.js` & `events.routes.js`. | **VERIFIED CLOSED** |
| **SEC-FIND-02** | 🔴 Critical | Authorization | Token bypass via client-supplied `user_id` query/body parameters | Eliminated trust in client parameters; all mutations strictly use `req.user.uid` extracted from cryptographically verified Firebase ID token. | **VERIFIED CLOSED** |
| **SEC-FIND-03** | 🟠 High | Anti-Abuse | Lack of native mobile app identity attestation | Deployed Firebase App Check verification middleware (`appCheckMiddleware.js`) rejecting unverified API calls. | **VERIFIED CLOSED** |
| **SEC-FIND-04** | 🟠 High | Evidence Security | Direct URL access risking data leakage of sensitive bystander recordings | Enforced private GCS bucket with CMEK and 5-minute expiring signed URLs strictly recorded in immutable audit logs. | **VERIFIED CLOSED** |
| **SEC-FIND-05** | 🟡 Medium | Observability | Latency blind spots during concurrent SOS surge | Mounted in-memory telemetry collector (`metricsMiddleware.js`) with Prometheus export and P95 SLA tracking. | **VERIFIED CLOSED** |
| **SEC-FIND-06** | 🟡 Medium | Data Integrity | Unindexed Firestore queries causing latency degradation during disaster restore | Created composite indexes (`firestore.indexes.json`) and automated Point-in-Time Recovery drill (`PitrRecoveryDrill`). | **VERIFIED CLOSED** |

---

## 3. Go/No-Go Decision Gate Statement
**Result: ZERO OPEN P0 / P1 FINDINGS.**  
All 6 findings from the independent assessment have been remediated, verified with unit/integration test gates, and approved for production staging.
