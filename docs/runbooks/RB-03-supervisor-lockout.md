# Runbook RB-03: Supervisor Lockout & Break-Glass Session Recovery

## 1. Trigger Condition & Alert Details
- **Trigger Scenario:** All active regional supervisors are unable to authenticate to the Control Room console due to Identity Provider (IdP) outage, corrupted session revoking, or rate-limited MFA failure.
- **Severity:** 🔴 **SEV-1 (Critical - Operational Blocker)**
- **Authorization Required:** Dual-custody approval (Engineering Lead + On-Duty Operations Commander).

---

## 2. Immediate Diagnostic Steps
1. Verify if Firebase Authentication or Google Cloud Identity is experiencing a regional incident (`status.firebase.google.com`).
2. Verify token issuance and Firebase App Check validation status:
   ```bash
   curl -I https://api.wana.in/healthz
   ```
3. Check supervisor rate-limiting lockouts in backend security audit logs:
   ```bash
   gcloud logging read 'jsonPayload.action="AUTH_LOCKOUT" AND timestamp>="now-15m"'
   ```

---

## 3. Break-Glass Procedure (Dual-Custody)

### Step 1: Request Emergency Break-Glass Token
1. Engineering Lead requests break-glass credentials stored in encrypted Google Cloud Secret Manager (`wana-breakglass-supervisor-secret`).
2. Operations Commander approves access request in GCP Cloud KMS / Access Approval.

### Step 2: Generate Emergency Temporary Supervisor Credential
Run the administrative session generation CLI script with mandatory reason logging:
```bash
node backend/src/scripts/generate-breakglass-session.js \
  --adminUid="admin_breakglass_sec_01" \
  --region="solapur_central" \
  --durationMinutes=120 \
  --incidentTicket="INC-99124" \
  --authorizedBy="eng_lead,ops_commander"
```

### Step 3: Audit Logging & Monitoring
- The break-glass generation script automatically writes a cryptographic immutable record to `audit_logs` in Firestore:
  ```json
  {
    "action": "BREAKGLASS_SESSION_INVOKED",
    "issuedTo": "admin_breakglass_sec_01",
    "ticket": "INC-99124",
    "authorizedBy": ["eng_lead", "ops_commander"],
    "expiresAt": "2026-10-06T17:45:00Z"
  }
  ```
- All actions executed under this session are streamed live to `#wana-security-audit` Slack channel.

---

## 4. Post-Recovery Revocation
Once standard IdP access is restored:
```bash
# Immediately revoke all active breakglass tokens and flush Redis session store
node backend/src/scripts/revoke-breakglass-session.js --adminUid="admin_breakglass_sec_01"
```
Re-authenticate control room supervisors using standard multi-factor authentication (MFA).
