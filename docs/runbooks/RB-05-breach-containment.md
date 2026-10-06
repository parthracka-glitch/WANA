# Runbook RB-05: Security Breach Containment, Secret Rotation & Forensic Lock

## 1. Trigger Condition & Alert Details
- **Trigger Scenario:** Compromised API keys, leaked Cloud KMS encryption keys, rogue administrative actor detection, or unauthorized exfiltration attempts.
- **Regulatory Framework:** Digital Personal Data Protection (DPDP) Act 2023 & CERT-In 6-Hour Mandatory Cyber Security Incident Reporting Requirement.
- **Severity:** 🔴 **SEV-0 (Security Emergency)**

---

## 2. Containment Sequence (< 15 Minutes)

### Step 1: Revoke Compromised Service Account Credentials
Immediately disable the affected IAM service account or developer key:
```bash
# Disable compromised service account
gcloud iam service-accounts disable compromised-sa@wana-prod-emergency.iam.gserviceaccount.com

# Delete compromised service account keys
gcloud iam service-accounts keys delete KEY_ID \
  --iam-account=compromised-sa@wana-prod-emergency.iam.gserviceaccount.com
```

### Step 2: Emergency Cloud KMS Secret & Master Key Rotation
Rotate Customer-Managed Encryption Keys (CMEK) used for evidence storage and database field encryption:
```bash
# Create new key version in Cloud KMS
gcloud kms keys versions create \
  --location=asia-south1 \
  --keyring=wana-emergency-keyring \
  --key=wana-evidence-cmek \
  --primary

# Trigger re-encryption of data protection keys in Secret Manager
gcloud secrets versions add wana-jwt-signing-secret --data-file=<(openssl rand -base64 64)
```

### Step 3: Invalidate All Active User & Supervisor Sessions
Force global token revocation by advancing `tokenRevokedBeforeTimestamp`:
```bash
# Force backend token revocation epoch advance
gcloud run services update wana-backend-prod \
  --region=asia-south1 \
  --update-env-vars=GLOBAL_TOKEN_REVOCATION_EPOCH=$(date +%s)
```

---

## 3. Forensic Preservation & Regulatory Compliance
1. **Freeze Evidence Partition:** Prevent deletion or automatic lifecycle purging of Cloud Logging and audit bucket data:
   ```bash
   gcloud storage buckets update gs://wana-evidence-cold-storage \
     --retention-period=365d \
     --lock-retention-period
   ```
2. **CERT-In Reporting (Mandatory within 6 Hours):**
   - Fill CERT-In Incident Reporting Template (format specified by Indian Computer Emergency Response Team).
   - Detail: System impacted, nature of incident, IP addresses involved, containment measures taken.
3. **Data Protection Board Notification (DPDP Act):**
   - Prepare notification to Data Protection Board of India specifying categories of personal data affected and mitigations implemented.
