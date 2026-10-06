# Runbook RB-02: Carrier SMS & WhatsApp Gateway Outage (TRAI DLT Failover)

## 1. Trigger Condition & Alert Details
- **Alert Rule:** `WanaAlert-SMS-DeliveryRate-Degraded`
- **Condition:** Emergency SMS dispatch delivery acknowledgment drops below 95% over a 5-minute window or upstream gateway returns HTTP 5xx / timeout.
- **Severity:** 🔴 **SEV-1 (Critical)**
- **Pager Channel:** PagerDuty `WANA-PROD-EMERGENCY` & WhatsApp Emergency Escalation.

---

## 2. Immediate Triage (< 2 Minutes)
1. **Identify Failing Gateway:**
   - Primary: Gupshup India DLT Gateway
   - Secondary: Twilio International / India Direct
   - Fallback: AWS SNS (India Transactional Route)
2. **Inspect Error Response Codes:**
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.component="dispatchService" AND severity>=ERROR' \
     --limit=50 --format=json
   ```
3. **Common Failures:**
   - `DLT_TEMPLATE_MISMATCH` (TRAI DLT Template Hash or Entity ID rejection).
   - `CARRIER_NETWORK_CONGESTION` (Local telecom circular outage: Jio / Airtel / Vi).
   - `GATEWAY_RATE_LIMIT_EXCEEDED` (Burst rate limit on provider API key).

---

## 3. Automated & Manual Failover Procedures

### Step A: Automatic Multi-Provider Switching
The `dispatchService.js` automatically cascades through registered providers:
```
Primary: Gupshup (DLT Approved) -> Secondary: Twilio -> Tertiary: Firebase In-App Push + WhatsApp API
```
If automatic cascading is degraded, enforce manual forced provider switch via Cloud Run environment variable:
```bash
gcloud run services update wana-backend-prod \
  --region=asia-south1 \
  --update-env-vars=SMS_PRIMARY_PROVIDER=twilio,ENABLE_SMS_FALLBACK_AGGRESSIVE=true
```

### Step B: TRAI DLT Template ID Hotfix
If TRAI regulatory audit blocks messages due to template ID expiry:
1. Obtain renewed Template ID from India DLT Portal (Vilpower / Jio DLT / Smartping).
2. Update config in Google Secret Manager:
   ```bash
   echo -n "NEW_DLT_TE_ID_1107..." | gcloud secrets versions add wana-dlt-template-id --data-file=-
   ```
3. Service automatically picks up updated secret within 60 seconds without redeployment.

---

## 4. Verification & Resolution
- Verify test emergency SMS dispatches to validator numbers across Airtel, Jio, and Vodafone-Idea.
- Confirm delivery receipt latency `< 4,000ms`.
- Transition alert state to GREEN in Cloud Monitoring.
