# Runbook RB-01: SOS End-to-End Latency Spike (>3.5s P95)

## 1. Trigger Condition & Alert Details
- **Alert Rule:** `WanaAlert-SOS-LatencyP95-Exceeded`
- **Condition:** P95 latency for `/api/events/sos` or `/api/events/heartbeat` exceeds 3,500ms over a 3-minute sliding window.
- **Severity:** 🔴 **SEV-1 (Critical)**
- **Pager Channel:** PagerDuty Escalation Policy `WANA-PROD-EMERGENCY` & Slack `#wana-incident-war-room`.

---

## 2. Immediate Triage (< 2 Minutes)
1. **Acknowledge Alert:** Primary on-call acknowledges incident in PagerDuty within 120 seconds.
2. **Inspect Telemetry Endpoint:**
   ```bash
   curl -s https://api.wana.in/healthz/metrics | jq .
   curl -s https://api.wana.in/metrics | grep wana_sos
   ```
3. **Verify Upstream Cloud Run Instances:**
   - Check Google Cloud Run CPU/Memory throttling and active container instance count.
   - Check whether minimum instances (`--min-instances=3`) are active.
   - Inspect Cloud Trace for database vs network wait times.

---

## 3. Diagnostic & Remediation Steps

### Step A: Firestore Lock Contention or Index Thrashing
1. **Symptom:** Cloud Trace shows latency concentrated in `firestore.runTransaction` calls on `ongoing_events`.
2. **Mitigation:**
   - Inspect Firestore contention metrics in GCP Console (`Cloud Firestore > Metrics > Document Contention`).
   - If hot partition detected on a single geographic region counter, scale background queue consumer rate limiter.

### Step B: Regional Network Ingress Degradation
1. **Symptom:** p95 latency high only on specific ISP or mobile carrier networks (e.g., Jio, Airtel).
2. **Mitigation:**
   - Check Cloud CDN & Cloud Armor edge pop latency in Mumbai / Pune / Delhi regions.
   - Reroute traffic via alternative Cloud Armor anycast edge nodes if regional route flap occurs.

### Step C: Autoscaling Saturation
1. **Symptom:** Cloud Run instances capped at `--max-instances` ceiling during unexpected emergency surge.
2. **Emergency Command:**
   ```bash
   gcloud run services update wana-backend-prod \
     --region=asia-south1 \
     --max-instances=50 \
     --concurrency=100
   ```

---

## 4. Rollback & Failover Procedures
If latency spike correlates with a recent canary deployment (within 15 minutes of release):
```bash
# Immediately revert 100% traffic to previous stable revision
gcloud run services update-traffic wana-backend-prod \
  --region=asia-south1 \
  --to-revisions=wana-backend-prod-stable=100
```

---

## 5. Verification & Resolution
- P95 latency drops and remains `< 3,500ms` for 10 consecutive minutes.
- In-memory metrics reflect `slaTargetMet: true` across all regional workers.
- Log resolution in `#wana-incident-war-room` with Root Cause Analysis (RCA) draft scheduled within 24 hours.
