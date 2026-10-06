# WANA Mobile Safety Client SDK & Integration Reference

**Phase 3 (Milestone M3: Complete SOS) Reference Implementation**

This SDK provides core modules and architectural patterns for the WANA citizen mobile safety application (compatible with React Native, Flutter, and native Android/iOS).

---

## 1. Modules Overview

### 1.1 `SosTriggerEngine` (`src/sosTriggerEngine.js` — M-01)
- **High-Priority Activation:** Single-tap or press-and-hold (1.5s).
- **Client-Side UUID v4:** Generates idempotent incident identifier before transmission.
- **10-Second False Alarm Slider:** Prevents accidental pocket dials from reaching dispatch.
- **Resilient Network Dispatch:** Retries with exponential backoff on intermittent cellular networks.

### 1.2 `BackgroundLocationService` (`src/backgroundLocationService.js` — M-02)
- **Sticky Location Stream:** Streams coordinate breadcrumbs every 15–30 seconds to `POST /events/:eventId/heartbeat`.
- **Android Foreground Service:** Configured with `foregroundServiceType="location"` and `START_STICKY`.
- **iOS CoreLocation:** Configured with `allowsBackgroundLocationUpdates = true` and `pausesLocationUpdatesAutomatically = false`.

### 1.3 `SilentTriggerService` (`src/silentTriggerService.js` — M-03)
- **Hardware Trigger:** Listens for 4 rapid presses of the Volume Down button within 2.5 seconds.
- **Multi-Tier Debouncing:** Filters out mechanical contact bounce (< 120ms) and normal volume step adjustments (> 800ms).
- **Stealth Dispatch:** Dispatches emergency incident with type `SILENT_DURESS` with zero screen illumination or audible alarms.

### 1.4 `EmergencyContactsManager` (`src/emergencyContactsManager.js` — M-09)
- **Onboarding UI Support:** Manages up to 5 emergency contacts per user.
- **Digital Consent Vault:** Records device ID and explicit digital consent timestamp before syncing with `POST /contacts`.

---

## 2. P0 Device Matrix & OEM Battery Optimizations

To ensure background location heartbeats survive screen-off states:
1. **Samsung (OneUI):** Prompt user to set WANA battery usage to **Unrestricted** under *Settings > Apps > WANA > Battery*.
2. **Xiaomi (MIUI/HyperOS):** Enable **Autostart** and set Battery Saver to **No Restrictions**.
3. **Google Pixel (Stock Android):** Request `ACCESS_BACKGROUND_LOCATION` after foreground permission is granted.
4. **Apple (iOS):** Request `Always Allow` location permission through the two-stage prompt flow.

---

## 3. SLA Escalation Standard

| Timer | Target | System Action |
|---|---|---|
| **Ack SLA** | **45 Seconds** | Unacknowledged incident escalates to `ESCALATED`. |
| **Heartbeat SLA** | **90 Seconds** | Device lacking location update marked `stale = true`. Never auto-resolved. |
| **Fallback SLA** | **300 Seconds** | Automatic telephony dispatch to backup regional control centers. |
