# WANA Web Supervisor & Admin System — Comprehensive Project Documentation

## 1. Executive Summary

**WANA** ("Women's Safety and Emergency Command Network") is an emergency response, command, and monitoring platform designed to provide rapid assistance and oversight during distress situations. 

The **Wanna-web-supervisor-admin** repository is the administrative and supervisory command center of the WANA ecosystem. It allows regional supervisors to monitor real-time SOS alerts and track community responders on interactive GIS maps, while providing regional administrators with governance tools to manage supervisor access and audit operational activity.

---

## 2. High-Level Architecture & Tech Stack

The application employs a **hybrid dual-database architecture** designed for high write throughput and real-time frontend streaming (via Cloud Firestore) alongside structured relational governance, regional constraints, and audit logging (via MongoDB).

```
                      +---------------------------------------+
                      |               CLIENT                  |
                      |   React 19 + Vite + React-Bootstrap   |
                      |       Mappls Vector Map v3.0 SDK      |
                      +-------------------+-------------------+
                                          |
                      +-------------------+-------------------+
                      |                                       |
           Direct Real-time Sync                      REST API Calls
                      |                          (Bearer Firebase ID Token)
                      v                                       v
         +--------------------------+           +--------------------------+
         |      Google Cloud        |           |     Node.js / Express    |
         |        Firestore         |           |      Backend Server      |
         +--------------------------+           +-------------+------------+
         | • ongoingEvents          |                         |
         | • acceptedEvents         |          +--------------+--------------+
         | • pastEvents             |          |                             |
         | • users                  |          v                             v
         +--------------------------+   +--------------+             +---------------+
                                        |   MongoDB    |             |Firebase Admin |
                                        | (Mongoose)   |             |     SDK       |
                                        +--------------+             +---------------+
                                        | • Admin      |             | • Token Verify|
                                        | • Supervisor |             | • Batch Writes|
                                        | • Audit Logs |             | • Event Clean |
                                        +--------------+             +---------------+
```

### Technology Breakdown

| Layer | Technologies Used | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, Vite 7 | Modern React SPA with fast HMR and client-side routing. |
| **Routing** | React Router DOM v7 | Nested routes, navigation redirects, and route guards. |
| **UI Components & Styling** | Bootstrap 5, React-Bootstrap, Vanilla CSS | Responsive layouts, cards, modals, tables, and custom CSS. |
| **Mapping & GIS** | Mappls (MapmyIndia) Vector Map SDK v3.0 | Real-time map rendering, custom markers, clustered popups, and city centering. |
| **Authentication (Client)** | Firebase Auth Web SDK v12 | Email/password authentication, email verification, password resets. |
| **Real-time Data (Client)** | Firebase Firestore Web SDK v12 | Direct reactive listener (`onSnapshot`) for real-time SOS incidents. |
| **Backend Framework** | Node.js v24+, Express v4.21 | RESTful API server handling business logic, access control, and batch jobs. |
| **Primary Relational DB** | MongoDB v8 via Mongoose ODM | Stores regional administrative hierarchies, supervisor records, and audit logs. |
| **Server Admin SDK** | Firebase Admin SDK v13 | Verifies client JWT tokens and performs administrative Firestore transactions. |
| **Background Jobs** | Node.js `setInterval` Daemon | Hourly automated archival of expired and resolved emergency events. |
| **Validation** | Joi | Schema validation for user registrations and incoming payloads. |

---

## 3. User Roles & Regional Governance Model

The platform enforces strict **geographic territory isolation**:

### A. Regional Administrator (`admin`)
* **Regional Constraint**: Strictly **one administrator per geographic region** (enforced by MongoDB unique index on the `region` field).
* **Pre-seeded Accounts**: Seeded during backend startup via `createAdmin.js` (e.g., `admin.solapur@wana.com`, `admin.pune@wana.com`).
* **Verification**: Administrators are exempted from Firebase email verification to prevent lockout.
* **Responsibilities**:
  1. Review supervisor applications originating from their specific region.
  2. Approve or revoke supervisor command center access.
  3. Inspect regional audit activity logs (logins, logouts, actions).
  4. Regional admins **cannot** view or alter records from another region.

### B. Regional Supervisor (`supervisor`)
* **Role**: Operational command center user responsible for overseeing live emergencies and responder dispatches in their assigned region.
* **Email Verification**: **Mandatory**. Supervisors cannot log in until their email address is verified via Firebase.
* **Multi-Step Onboarding Workflow**:
  1. **Step 1 — Registration (`/register`)**: Creates Firebase Auth credentials and an initial MongoDB supervisor record with an empty region (`region: ""`).
  2. **Step 2 — Regional Selection (`/complete-profile`)**: Prompts supervisor to select their assigned city (e.g., Solapur, Pune, Mumbai, Nagpur).
  3. **Step 3 — Approval Waiting Room (`/pending-approval`)**: Once region is assigned, the supervisor enters a pending approval state.
  4. **Step 4 — Command Center Access (`/supervisor/dashboard`)**: Unlocked as soon as the respective regional admin approves the supervisor in MongoDB.

---

## 4. Detailed Feature Breakdown (What Is Built Till Now)

### 4.1 Authentication & Security Architecture
* **Firebase Token Authentication**: The client retrieves a Firebase ID token upon login and transmits it via the `Authorization: Bearer <token>` header to the Express backend.
* **Unified Role & Status Resolver (`GET /auth/status/:uid`)**:
  * Evaluates whether the incoming Firebase UID corresponds to an Admin or a Supervisor.
  * Checks MongoDB approval status and assigned territory.
  * Properly returns 404 with error payload if the user is missing from MongoDB.
* **Multi-Gate Route Guard (`ProtectedRoute.jsx`)**:
  * **Gate 1 (Auth)**: Checks Firebase auth session; redirects unauthenticated visitors to `/login`.
  * **Gate 2 (Role)**: Ensures users without the specified `allowedRole` are redirected to `/home`.
  * **Gate 3 (Supervisor Lifecycle)**:
    * If `region` is missing $\rightarrow$ Redirects to `/complete-profile`.
    * If `!isApproved` $\rightarrow$ Redirects to `/pending-approval`.
    * If approved and attempting to visit onboarding routes $\rightarrow$ Redirects to `/supervisor/dashboard`.
* **Supervisor Activity Audit Logging (`/logs/create`, `/logs/region`)**:
  * Logs supervisor events (`login`, `logout`, and custom operational actions).
  * Automatically filters logs so regional admins only see activities from their designated city.

---

### 4.2 Supervisor Command Center & GIS Map (`/supervisor/dashboard`)
* **Real-time Emergency Feed**:
  * Sets up a real-time Firestore `onSnapshot` listener on the `ongoingEvents` collection:
    $$\text{city} == \text{supervisor.region} \quad \text{AND} \quad \text{is\_resolved} == \text{false}$$
  * Eliminates page refreshing; new emergency alerts pop up in real-time.
* **Universal Geographic Coordinate Parsing (`extractLatLng`)**:
  * Seamlessly normalizes varying geospatial structures:
    * Firestore `GeoPoint` (`latitude`, `longitude`)
    * Plain coordinate objects (`{ lat, lng }`)
    * Formatted coordinate strings (e.g., `["17.65° N", "75.94° E"]`)
    * Coordinate arrays (`[17.65, 75.94]`)
* **Mappls Vector Map v3.0 Integration (`Map.jsx`)**:
  * Map automatically centers and sets city-level zoom on the supervisor's region using coordinates defined in `regionCenters.js`.
  * **SOS Victim Pins**: Placed as distinct red markers with metadata popups indicating emergency type, victim email, event ID, and responder count.
  * **Responder / Acceptor Pins**: Placed as green markers showing the responder's current location, name, and contact details.
  * **Proximity Marker Deconfliction**: Features a custom angular clustering algorithm that offsets nearby responder pins in a circular pattern ($\approx 22$ meters) to prevent marker overlap when multiple rescuers arrive at the same scene.
* **Locate & Focus Action**: Clicking the "Locate" button in either the Ongoing Events table or Acceptors table smoothly scrolls to the top and flies the map viewport directly to the incident coordinates at zoom level 16.

---

### 4.3 Incident Dispatch & Responders Management
* **Live Responder Tracking (`/supervisor/acceptors`)**:
  * Discovers responders in real time by scanning the subcollections `acceptedEvents/{eventId}/acceptors`.
  * Shows responder name, email, accepted timestamp, responder coordinates, and the corresponding SOS incident.
* **Ongoing Events Overview (`/supervisor/ongoing-events`)**:
  * Dedicated high-density monitoring table displaying all active distress calls in the region with emergency message text, type badge, coordinates, and event ID.

---

### 4.4 Incident History & Archival Analysis (`/supervisor/history`)
* **Historical Database Queries**:
  * Pulls from the `pastEvents` Firestore collection where:
    $$\text{city} == \text{supervisor.region} \quad \text{AND} \quad \text{is\_resolved} == \text{true}$$
* **Multi-Parameter Search & Filter Engine**:
  * Full text search by victim email address or Event ID.
  * Dynamic date filtering with Start Date (`fromDate`) and End Date (`toDate`) pickers.
  * Real-time result counter badge.
* **Archived Responder Retrieval**:
  * Queries archived responders directly from `pastEvents/{eventId}/acceptors` with an automatic fallback to `acceptedEvents/{eventId}/acceptors`.
  * Distinguishes between events resolved manually by the user clicking "I'm safe" versus incidents marked by the automated cleanup daemon.

---

### 4.5 Admin Control & Approval Center (`/admin/approval`)
* **Three-Tab Management Interface**:
  1. **Pending Approvals Tab**: Lists unapproved supervisors within the admin's region. Contains a one-click "Approve" button that updates MongoDB status.
  2. **Active Supervisors Tab**: Displays approved supervisors with a "Revoke Access" action. Revocation resets the supervisor's region and sets `isApproved: false`, cleanly pushing them back into onboarding if they log in again.
  3. **Activity History Tab**: Live table of all supervisor logins and actions tagged for the admin's region.

---

### 4.6 Automated Event Lifecycle & Housekeeping Daemon
* **Manual Resolution Endpoint (`POST /events/resolve/:eventId`)**:
  * Triggered when a victim reports safety ("I'm safe").
  * Uses a Firestore **atomic batch operation** to:
    1. Copy event data to `pastEvents` with `is_resolved: true` and timestamp.
    2. Copy all associated responders to `pastEvents/{eventId}/acceptors`.
    3. Delete responder documents from `acceptedEvents/{eventId}/acceptors`.
    4. Delete the parent `acceptedEvents/{eventId}` document.
    5. Delete the active event from `ongoingEvents`.
* **Automated 24-Hour Cleanup Job (`eventCleanupJob.js`)**:
  * Background cron job running every 60 minutes.
  * Automatically finds any unresolved events older than 24 hours.
  * Archives them into `pastEvents` with `auto_resolved: true` and `resolved_reason: "Auto-resolved after 24 hours"`.
  * Prevents testing events or stale incidents from cluttering the command center map.
* **Resilient Fallback Mode**:
  * Includes programmatic in-memory query fallbacks if Firestore composite indexes are building or missing.

---

## 5. Complete Database Schema Reference

### 5.1 MongoDB Collections

#### 1. `Admin` Collection (`models/admin.js`)
```javascript
{
  name:        { type: String, required: true },
  email:       { type: String, required: true, unique: true },
  firebaseUid: { type: String, required: true, unique: true },
  region:      { type: String, required: true, unique: true }, // 1 admin per region
  role:        { type: String, enum: ["admin"], default: "admin" },
  timestamps:  true // createdAt, updatedAt
}
```

#### 2. `Supervisor` Collection (`models/supervisor.js`)
```javascript
{
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true },
  firebaseUid: { type: String, required: true, unique: true },
  region:      { type: String, default: "", index: true }, // Empty until Step 2
  role:        { type: String, enum: ["supervisor"], default: "supervisor" },
  isApproved:  { type: Boolean, default: false },
  timestamps:  true // createdAt, updatedAt
}
```

#### 3. `SupervisorLog` Collection (`models/supervisorLog.js`)
```javascript
{
  supervisorUid:     { type: String, required: true },
  email:             { type: String, required: true },
  eventType:         { type: String, enum: ["login", "logout", "action"], required: true },
  actionDescription: { type: String, default: "" },
  region:            { type: String, required: true },
  timestamp:         { type: Date, default: Date.now }
}
```

---

### 5.2 Google Cloud Firestore Collections

#### 1. `ongoingEvents` Collection
* **Document ID**: Unique Event ID (e.g., auto-generated or client UUID)
* **Fields**:
  * `event_id`: String
  * `sos_clicked_by_uid`: Firebase User UID
  * `sos_clicked_by_email`: String (email of victim)
  * `emergency_type`: String (e.g., "Medical", "Harassment", "Assault", "SOS")
  * `emergency_message`: String
  * `city`: String (Matches region, e.g. "Solapur", "Pune")
  * `location`: `GeoPoint` or `{ latitude, longitude }` or `[lat, lng]`
  * `notified_to`: Array of Strings (contacts / user IDs)
  * `is_resolved`: Boolean (`false`)
  * `timestamp`: Firestore Timestamp

#### 2. `acceptedEvents/{eventId}/acceptors` Subcollection
* **Document ID**: Acceptor User UID
* **Fields**:
  * `name`: String
  * `email`: String
  * `acceptedAt`: Firestore Timestamp
  * `userLocation`: `GeoPoint` or coordinate representation of responder position

#### 3. `pastEvents` Collection
* **Document ID**: Original Event ID
* **Fields**: All fields from `ongoingEvents`, plus:
  * `is_resolved`: `true`
  * `resolved_at`: Firestore Timestamp
  * `resolved_reason`: String ("User clicked I'm safe" or "Auto-resolved after 24 hours")
  * `auto_resolved`: Boolean
* **Subcollection**: `pastEvents/{eventId}/acceptors` containing archived responder documents.

#### 4. `users` Collection
* **Document ID**: Firebase UID
* **Fields**: `uid`, `name`, `email`, `role`, `region`, `isApproved`, `createdAt`.

---

## 6. Backend API Route Reference

| Method | Endpoint | Protection | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/auth/status/:uid` | Public | Returns `{ role, isApproved, email, region }` for a given Firebase UID. |
| **POST** | `/supervisor/register` | Public | Registers initial supervisor identity (`name`, `email`, `firebaseUid`). |
| **GET** | `/supervisor/status/:uid` | Public | Checks region completion and approval status for supervisor. |
| **PATCH** | `/supervisor/complete-profile` | `authMiddleware` | Sets supervisor region (Step 2 onboarding). |
| **GET** | `/supervisor/profile` | `authMiddleware` | Returns full authenticated supervisor profile. |
| **GET** | `/admin/supervisors/pending` | `authMiddleware` (Admin) | Returns pending supervisors in admin's region. |
| **GET** | `/admin/supervisors/approved` | `authMiddleware` (Admin) | Returns active supervisors in admin's region. |
| **PATCH** | `/admin/supervisors/:id/approve` | `authMiddleware` (Admin) | Approves supervisor account. |
| **PATCH** | `/admin/supervisors/:id/revoke` | `authMiddleware` (Admin) | Revokes supervisor access and clears region. |
| **POST** | `/logs/create` | `authMiddleware` (Supervisor) | Records an activity log for the supervisor. |
| **GET** | `/logs/region` | `authMiddleware` (Admin) | Fetches activity logs for the admin's region. |
| **POST** | `/events/resolve/:eventId` | Public | Resolves event and moves to `pastEvents` with acceptors. |
| **POST** | `/cleanup/events` | `authMiddleware` | Manually triggers 24-hour cleanup of stale events. |
| **GET** | `/cleanup/status` | Public | Returns status and interval of the event cleanup daemon. |

---

## 7. Frontend Routing & Page Map

| Path | Component | Guard / Access | Description |
| :--- | :--- | :--- | :--- |
| `/home` | `Home.jsx` | Public | Landing page with introductory overview. |
| `/login` | `Login.jsx` | Public | Login with email, password, and password reset. |
| `/register` | `Signup.jsx` | Public | Supervisor signup with password strength indicator. |
| `/complete-profile` | `CompleteProfile.jsx` | Supervisor (Uncompleted) | Step 2 region assignment dropdown. |
| `/pending-approval` | `PendingApproval.jsx` | Supervisor (Unapproved) | Waiting room pending regional admin approval. |
| `/supervisor/dashboard` | `SupervisorDashboard.jsx` | Supervisor (Approved) | Command center with interactive Mappls map and tables. |
| `/supervisor/ongoing-events`| `OngoingEvents.jsx` | Supervisor (Approved) | List of live active SOS events in region. |
| `/supervisor/acceptors` | `AcceptorEvents.jsx` | Supervisor (Approved) | List of active community responders. |
| `/supervisor/history` | `Historyf.jsx` | Supervisor (Approved) | Historical search, filter, and archive logs. |
| `/admin/approval` | `AdminApproval.jsx` | Admin | Regional supervisor approvals, revocations, and logs. |
| `/admin/logs` | `AdminLogs.jsx` | Admin | Standalone table of supervisor audit logs. |
| `/logout` | `logout.jsx` | Authenticated | Confirmation screen for logging out. |
| `/dashboard` | `Dashboard.jsx` | Authenticated (Legacy) | Generic map view demo. |
| `/currentstatus` | `CurrentStatusf.jsx` | Authenticated (Legacy) | Unfiltered ongoing events table. |

---

## 8. Project Directory Structure

```
Internship Project/
├── PROJECT_DOCUMENTATION.md                  <-- Project documentation & manual
├── Wanna-web-supervisor-admin-main.zip
└── Wanna-web-supervisor-admin-main/
    └── Wanna-web-supervisor-admin-main/
        ├── README.md
        ├── .gitignore
        ├── .vscode/
        │   └── settings.json
        │
        ├── backend/
        │   ├── .env.example                  <-- Environment template
        │   ├── package.json                  <-- Node dependencies & scripts
        │   ├── EVENT_CLEANUP_FEATURE.md
        │   ├── FIRESTORE_INDEX_SETUP.md
        │   ├── test-resolve-endpoint.js
        │   └── src/
        │       ├── app.js                    <-- Express entry point
        │       ├── configuration/
        │       │   ├── dbConfig.js           <-- MongoDB connection
        │       │   └── firebaseConfig.js     <-- Firebase Admin SDK initialization
        │       ├── middleware/
        │       │   └── authMiddleware.js     <-- JWT token verification & role check
        │       ├── models/
        │       │   ├── admin.js              <-- Admin schema (1 per region)
        │       │   ├── supervisor.js         <-- Supervisor schema
        │       │   └── supervisorLog.js      <-- Audit activity log schema
        │       ├── routes/
        │       │   ├── auth.routes.js        <-- /auth/status/:uid resolver
        │       │   ├── admin.routes.js       <-- Supervisor approvals & revocations
        │       │   ├── supervisor.routes.js  <-- Supervisor onboarding & profile
        │       │   ├── events.routes.js      <-- Event resolution endpoint
        │       │   ├── logs.routes.js        <-- Activity logging endpoints
        │       │   └── cleanup.routes.js     <-- Event cleanup trigger endpoints
        │       ├── jobs/
        │       │   └── eventCleanupJob.js    <-- Hourly cleanup cron job
        │       └── scripts/
        │           ├── createAdmin.js        <-- Auto-seeds regional admins on startup
        │           ├── cleanupOldEvents.js   <-- Core 24h event cleanup logic
        │           ├── cleanupResolvedEvents.js
        │           ├── cleanupOldAcceptors.js
        │           ├── cleanupAllOldAcceptedEvents.js
        │           └── fixPastEventAcceptors.js
        │
        └── frontend/
            ├── .env.example                  <-- Frontend environment template
            ├── index.html                    <-- Contains Mappls Vector Map v3.0 script
            ├── package.json                  <-- React, Vite, Leaflet, Bootstrap
            ├── vite.config.js
            ├── vercel.json
            └── src/
                ├── main.jsx                  <-- React DOM entry point
                ├── App.jsx                   <-- Route declarations & layout
                ├── App.css
                ├── index.css
                ├── config/
                │   └── api.js                <-- API base URL helper
                ├── constants/
                │   └── regionCenters.js      <-- City coordinates (Maharashtra)
                ├── firebase/
                │   └── firebaseConfig.js     <-- Firebase Client SDK configuration
                └── pages/
                    ├── header/               <-- Top navigation bar
                    ├── Home/                 <-- Public landing page
                    ├── auth/                 <-- Login, Signup, Logout
                    ├── components/           <-- ProtectedRoute & PrivateRoute
                    ├── supervisor/           <-- Command Center, Ongoing, Acceptors, History
                    ├── admin/                <-- Admin Approvals & Logs
                    ├── dashboard/            <-- Map.jsx & Dashboard.jsx
                    └── Currentstatus/        <-- CurrentStatusf.jsx
```

---

## 9. Setup & Local Execution Guide

### Prerequisites
1. **Node.js**: v18.0.0 or higher (v24.18.0 tested & verified).
2. **MongoDB**: Local MongoDB instance (default port `27017`) or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster URI.
3. **Firebase Project**: The project is connected to Firebase project `wana-9705e`. For backend token verification and Firestore batch operations, a service account private key is required.

---

### Step 1: Backend Setup

1. Open a terminal in the backend directory:
   ```bash
   cd "Wanna-web-supervisor-admin-main/Wanna-web-supervisor-admin-main/backend"
   ```
2. Install dependencies (Already performed):
   ```bash
   npm install
   ```
3. Create your `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Configure `.env` with your MongoDB URI and Firebase Admin credentials:
   ```env
   PORT=3000
   MONGO_URI=mongodb://localhost:27017/wana
   FIREBASE_PROJECT_ID=wana-9705e
   FIREBASE_CLIENT_EMAIL=your-service-account@wana-9705e.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
5. Start the backend server:
   ```bash
   # Development mode with auto-reload (using nodemon):
   npm run dev

   # Or standard production start:
   npm start
   ```
   *The server will connect to MongoDB, seed the regional admins (Solapur & Pune), start the hourly event cleanup job, and listen on port 3000.*

---

### Step 2: Frontend Setup

1. Open a second terminal in the frontend directory:
   ```bash
   cd "Wanna-web-supervisor-admin-main/Wanna-web-supervisor-admin-main/frontend"
   ```
2. Install dependencies (Already performed):
   ```bash
   npm install
   ```
3. (Optional) Create `.env` if using a custom backend port:
   ```env
   VITE_API_URL=http://localhost:3000
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. Open your browser at:
   ```
   http://localhost:5173
   ```

---

### Step 3: Verified Pre-Seeded Test Credentials

| Role | Email | Region | Description |
| :--- | :--- | :--- | :--- |
| **Admin (Solapur)** | `admin.solapur@wana.com` | Solapur | Has authority to approve/revoke Solapur supervisors and view Solapur logs. |
| **Admin (Pune)** | `admin.pune@wana.com` | Pune | Has authority to approve/revoke Pune supervisors and view Pune logs. |
| **Supervisor** | User registered via `/register` | Selected during Step 2 | Receives regional dispatch and monitoring permissions once approved. |

---

## 10. Audit Findings & Improvements Implemented

During this setup and code audit, the following adjustments were executed:

1. **Fixed Hanging Response Bug in `/auth/status/:uid` (`backend/src/routes/auth.routes.js`)**:
   * *Problem*: If an authenticated user was present in Firebase but not yet saved in MongoDB, the route logged to console but never sent an HTTP response, causing the frontend `ProtectedRoute` spinner to freeze indefinitely.
   * *Fix*: Added explicit `return res.status(404).json(...)` when user is not found.
2. **Removed Malformed Self-Dependency (`backend/package.json`)**:
   * *Problem*: Line 28 contained `"wanaweb": "file:"`, which caused npm circular reference warnings and installation anomalies.
   * *Fix*: Removed `"wanaweb": "file:"`.
3. **Configured `nodemon` in Backend**:
   * Added `nodemon` as a development dependency so `npm run dev` executes smoothly without missing-binary errors.
4. **Added Environment Configuration Templates**:
   * Created `backend/.env.example` and `frontend/.env.example` detailing all required variables.
5. **Verified Frontend Build Pipeline**:
   * Validated production build via `npm run build` (Vite outputting minified bundle in `frontend/dist/` with 0 errors).
6. **Firestore Index Reminder**:
   * The automatic event cleanup job queries `ongoingEvents` by `is_resolved` (Ascending) and `timestamp` (Ascending). If not already created in Firebase Console, the system seamlessly falls back to in-memory filtering.
