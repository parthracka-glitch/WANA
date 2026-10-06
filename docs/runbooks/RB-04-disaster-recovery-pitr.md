# Runbook RB-04: Disaster Recovery & Firestore Point-in-Time Recovery (PITR)

## 1. Trigger Condition & Recovery Scope
- **Trigger Scenario:** Accidental administrative data corruption, catastrophic database logical damage, or ransomware/malicious wipe of live collections (`ongoing_events`, `accepted_events`, `audit_logs`).
- **Target Objectives:**
  - **Recovery Time Objective (RTO):** < 30 minutes from incident declaration to traffic restoration.
  - **Recovery Point Objective (RPO):** < 5 minutes of data loss delta prior to incident corruption timestamp.
- **Severity:** 🔴 **SEV-0 (Catastrophic)**

---

## 2. Emergency Point-in-Time Recovery (PITR) Execution

### Step 1: Declare Disaster Recovery State
Declare SEV-0 in incident management system. Immediately throttle mutating public ingress to prevent compounding data corruption:
```bash
gcloud run services update wana-backend-prod \
  --region=asia-south1 \
  --update-env-vars=MAINTENANCE_MODE_DISASTER_RECOVERY=true
```

### Step 2: Determine Exact Recovery Timestamp ($T_{recover}$)
Identify the microsecond immediately preceding corruption event ($T_{corrupt}$):
```bash
# E.g., if incident occurred at 2026-10-06T14:32:10Z, recover to 2026-10-06T14:32:00Z
TARGET_RECOVERY_TIME="2026-10-06T14:32:00Z"
```

### Step 3: Execute Cloud Firestore PITR Restore Operation
Restore the database to a new target database instance in `asia-south1`:
```bash
gcloud firestore databases restore \
  --source-database='(default)' \
  --destination-database='wana-prod-recovered' \
  --recovery-time="${TARGET_RECOVERY_TIME}" \
  --project="wana-prod-emergency"
```

### Step 4: Verify Data & Index Integrity
Run the automated verification script:
```bash
node backend/src/scripts/pitr-backup-drill.js \
  --targetDatabase="wana-prod-recovered" \
  --verifyIntegrity=true
```
The script verifies:
1. All `ongoing_events` and active GPS trajectories match recovery timestamp.
2. `audit_logs` cryptographic chain hash is verified without missing links.
3. Composite indexes are built and online.

### Step 5: Switch Application Database Routing
Point Cloud Run service configuration to the restored database:
```bash
gcloud run services update wana-backend-prod \
  --region=asia-south1 \
  --update-env-vars=FIRESTORE_DATABASE_ID=wana-prod-recovered,MAINTENANCE_MODE_DISASTER_RECOVERY=false
```

---

## 3. SLA Validation & Verification Gate
- Confirm RTO: Total recovery duration from declaration to traffic restoration ≤ 30 minutes.
- Confirm RPO: Validated transactions lost ≤ 5 minutes.
- Verify live mobile app SOS dispatch and supervisor control room realtime listeners.
