# LEGAL-01: Data Protection Impact Assessment (DPIA) & Evidence Governance Policy

**Status:** APPROVED  
**Date:** 2026-10-06  
**Jurisdiction:** Republic of India — Digital Personal Data Protection (DPDP) Act 2023 & Information Technology Act 2000  
**Target Milestone:** Milestone M4 (Evidence & Resilience)  
**Authors:** WANA Safety & Legal Compliance Working Group  

---

## 1. Executive Summary & Purpose

The WANA Emergency Command Network provides continuous citizen safety, rapid manual/silent SOS triggers, real-time location streaming, and automated emergency contact notification. Under **Milestone M4**, the platform incorporates **ambient audio and video multimedia evidence collection** during active SOS emergencies.

Because multimedia capture in an emergency setting involves processing sensitive personal data (audio voices, ambient visual records, location timestamps), this Data Protection Impact Assessment (DPIA) and Evidence Governance Policy establishes mandatory technical, legal, and operational safeguards to:
1. Ensure full compliance with Section 6 (Consent) and Section 7 (Certain Legitimate Uses — emergency citizen protection) of the **India DPDP Act 2023**.
2. Establish a legally admissible **Chain of Custody** meeting Section 65B of the Indian Evidence Act (now Section 63 of Bharatiya Sakshya Adhiniyam, 2023).
3. Ensure zero unauthorized access, zero public bucket exposure, and strict cryptographic accountability.

---

## 2. DPDP Act 2023 Compliance Principles

### 2.1 Purpose Specification & Proportionality (Section 5 & 6)
- **Active SOS Condition:** Multimedia evidence capture is **strictly gated to active SOS events**. No audio or video capture shall ever occur in idle or standby states.
- **Proportionality:** Recording is sliced into discrete 15-second segments to allow resumable transmission without retaining excessive local storage on the citizen device.
- **User Agency:** Citizens are informed during onboarding with clear, unambiguous notices regarding emergency evidence capture. In non-silent SOS triggers, a persistent notification on Android/iOS indicates active emergency protection.

### 2.2 Lawful Processing under Emergency / Life Threat (Section 7(b))
Under Section 7(b) of the DPDP Act 2023, processing of personal data without formal contemporaneous consent is legally permissible:
> *"for responding to any medical emergency involving a threat to the life or immediate serious threat to the health of the Data Principal or any other individual."*

WANA's evidence capture is activated exclusively during life-safety threats (SOS triggers) to safeguard the Data Principal.

---

## 3. Evidence Pipeline Technical Safeguards

```
[Citizen Mobile Device]
  │
  ├── 1. Capture 15s Audio/Video Chunk
  ├── 2. Buffer in OS Encrypted Sandbox (EncryptedFile)
  ├── 3. Calculate SHA-256 Digest
  │
  ▼ [TLS 1.3 Transport with Bearer Token]
[WANA Secure Backend (BE-09)]
  │
  ├── 4. Verify SHA-256 Checksum (Rejects if Mismatch)
  ├── 5. Ingest Metadata into Firestore `evidence` Collection
  ├── 6. Store Payload in CMEK-Encrypted Cloud Storage Bucket
  │
  ▼ [Audited Access Control]
[Supervisor Web Console (FE-18)]
  │
  ├── 7. Request Streaming Link (Requires Role + Matching regionId)
  ├── 8. Issue Short-Lived Signed URL (5-Minute Maximum TTL)
  ├── 9. Log Immutable Audit Record: { actorUid, eventId, mediaId, action: 'EVIDENCE_VIEWED' }
  └── 10. Direct Download Prohibited (HTML5 controlsList="nodownload")
```

### 3.1 Integrity & SHA-256 Seal
- Every 15-second chunk captured on the device is cryptographically hashed with SHA-256 before transmission.
- The backend recalculates the SHA-256 checksum upon receipt. If the client checksum and server checksum do not match exactly, the chunk is immediately rejected with HTTP 400 `CHECKSUM_MISMATCH`, preventing transit corruption or tampering.

### 3.2 Storage Encryption (CMEK)
- Raw multimedia chunks are stored in a private Google Cloud Storage bucket with **Customer-Managed Encryption Keys (CMEK)** via Cloud KMS.
- **Zero Public Access:** Uniform bucket-level access is enforced with public read/list disabled (`allUsers` and `allAuthenticatedUsers` permissions strictly denied).

### 3.3 Zero Persistent URLs & 5-Minute TTL
- Evidence files never possess public static URLs.
- Streaming playback is only permitted via **V4 Signed URLs** with a maximum Time-To-Live (TTL) of **300 seconds (5 minutes)**.
- Signed URLs are generated strictly after verifying the supervisor's custom claims (`role === 'supervisor'` or `'admin'`) and ensuring the supervisor's `regionId` matches the event's derived `regionId`.

### 3.4 Immutable Supervisor Audit Logging
- Every attempt by a supervisor or administrator to stream or review evidence generates a permanent audit record written to Firestore `auditLogs`:
  ```json
  {
    "actorUid": "sup_solapur_01",
    "actorRole": "supervisor",
    "actorRegionId": "solapur",
    "action": "EVIDENCE_VIEWED",
    "eventId": "wana-sos-uuid",
    "mediaId": "chunk-001.mp4",
    "ip": "103.21.244.1",
    "timestamp": 1728212400000
  }
  ```
- Front-end media players prohibit direct browser downloads (`controlsList="nodownload"`, right-click context menu disabled).

---

## 4. Retention & Hard-Delete Schedule

| Evidence Category | Standard Retention | Legal Hold Retention | Automated Action |
|---|---|---|---|
| Active SOS Audio/Video | 30 Calendar Days | Indefinite until case resolved | Purged automatically via Cloud Scheduler daily cron (`POST /evidence/cleanup-expired`) |
| Location Breadcrumbs | 90 Calendar Days | Indefinite | Retained in cold storage archive |
| Audit Trail Records | 365 Calendar Days | 7 Years | Retained in immutable audit log store |

When `retentionExpiresAt` is reached without an active judicial or law-enforcement hold flag, both the Cloud Storage object and Firestore metadata document are permanently destroyed.

---

## 5. Mandatory Release Gate Checklist

- [x] Legal sign-off documented and versioned in repository (`LEGAL-01`).
- [x] SHA-256 verification active on backend upload endpoint (`BE-09`).
- [x] Signed URL maximum TTL configured to <= 300 seconds.
- [x] Regional role isolation enforced on evidence access routes.
- [x] Supervisor playback produces immutable audit log records (`FE-18`).
- [x] Automated retention expiration cleaner tested and operational.
