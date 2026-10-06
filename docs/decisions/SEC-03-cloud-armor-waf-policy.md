# Security Architecture Decision Record SEC-03: Cloud Armor WAF & Edge Security Policy Specification

**Status:** APPROVED  
**Date:** 2026-10-06  
**Audience:** Security Engineering, DevOps, Platform Architecture  

---

## 1. Context & Threat Ingress Vectors
The WANA Emergency Dispatch API endpoints (`/api/events/sos`, `/api/events/heartbeat`, `/api/evidence/*`) represent high-value national safety infrastructure. 

Ingress attack surfaces include:
1. Distributed Denial of Service (DDoS) overwhelming emergency dispatch endpoints.
2. Geo-spoofing and traffic originating from known bulletproof hosting providers or anonymizing TOR exit nodes.
3. Automated credential-stuffing and App Check bypass attacks.
4. Slowloris and L7 HTTP flood attacks during mass disaster scenarios.

---

## 2. Google Cloud Armor WAF Rule Hierarchy

| Priority | Rule Name | Expression / Condition | Action | Rate / Threshold |
|---|---|---|---|---|
| **1000** | `ALLOW-EMERGENCY-HEALTH` | `request.path == '/healthz'` | ALLOW | Unlimited |
| **2000** | `BLOCK-TOR-AND-BAD-ACTORS` | `origin.asn in [tor_exit_asns] \|\| evaluateThreatIntelligence('abuse-ip-db')` | DENY (403) | Immediate drop |
| **3000** | `GEO-ENFORCE-INDIA-PRIMARY` | `origin.region_code == 'IN'` | ALLOW | Primary route |
| **3500** | `GEO-RATE-LIMIT-OVERSEAS` | `origin.region_code != 'IN'` | RATE_LIMIT | 10 req/min per IP |
| **4000** | `RATE-LIMIT-SOS-INGRESS` | `request.path.matches('/api/events/sos')` | RATE_LIMIT (Banned: 10m) | 60 req/min per IP |
| **5000** | `BOT-MANAGEMENT-RECAPTCHA` | `token.recaptcha_action_assessment == 'LOW'` | REDIRECT_CHALLENGE | reCAPTCHA Enterprise |
| **2147483647** | `DEFAULT-ALLOW-SANITIZED` | `*` | ALLOW | Monitored |

---

## 3. Terraform / gcloud Specification
```bash
# Create Security Policy
gcloud compute security-policies create wana-cloud-armor-edge-policy \
    --description="WANA Production Edge WAF & Anti-DDoS Policy"

# Rule 2000: Block Known Threat Intelligence IPs
gcloud compute security-policies rules create 2000 \
    --security-policy=wana-cloud-armor-edge-policy \
    --expression="evaluateThreatIntelligence('threat-intel-all-bad-ips')" \
    --action=deny-403 \
    --description="Block malicious threats from Threat Intelligence feed"

# Rule 4000: Throttle SOS endpoint flooding
gcloud compute security-policies rules create 4000 \
    --security-policy=wana-cloud-armor-edge-policy \
    --expression="request.path.matches('/api/events/sos')" \
    --action=rate-based-ban \
    --rate-limit-threshold-count=60 \
    --rate-limit-threshold-interval-sec=60 \
    --ban-duration-sec=600 \
    --conform-action=allow \
    --exceed-action=deny-429 \
    --enforce-on-key=IP
```

---

## 4. Verification & Validation
- Load tests confirm legitimate high-concurrency SOS triggers passing through authenticated mobile apps (App Check verified) are not dropped.
- Attack traffic with malicious headers is dropped at Google edge pop prior to reaching Cloud Run.
