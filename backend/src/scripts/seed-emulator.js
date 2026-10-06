/**
 * scripts/seed-emulator.js
 * Provisions baseline regional data, administrative staff, supervisors,
 * and test incidents for local Firebase Emulator or staging development.
 * (OPS-04)
 */

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "wana-dev" });
}

const db = admin.firestore();

async function seedEmulator() {
  console.log("🌱 Starting Emulator Database Seeding...");
  const batch = db.batch();

  // 1. Seed Regions
  const solapurRegionRef = db.collection("regions").doc("solapur");
  batch.set(solapurRegionRef, {
    id: "solapur",
    name: "Solapur City",
    center: { lat: 17.6599, lng: 75.9064 },
    zoom: 12,
    status: "active",
    adminUid: "admin_solapur_uid",
    ackSlaSeconds: 60,
    staleSeconds: 300,
    fallbackRegionId: "pune",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const puneRegionRef = db.collection("regions").doc("pune");
  batch.set(puneRegionRef, {
    id: "pune",
    name: "Pune Metro",
    center: { lat: 18.5204, lng: 73.8567 },
    zoom: 12,
    status: "active",
    adminUid: "admin_pune_uid",
    ackSlaSeconds: 60,
    staleSeconds: 300,
    fallbackRegionId: "solapur",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 2. Seed Staff (Super Admin, Regional Admins, Supervisors)
  const staffMembers = [
    {
      uid: "admin_platform_uid",
      email: "platform-admin@wana.org",
      name: "Super Platform Admin",
      role: "admin",
      regionId: "all",
      status: "APPROVED",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsVersion: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      uid: "admin_solapur_uid",
      email: "admin-solapur@wana.org",
      name: "Solapur Regional Admin",
      role: "admin",
      regionId: "solapur",
      status: "APPROVED",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsVersion: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      uid: "admin_pune_uid",
      email: "admin-pune@wana.org",
      name: "Pune Regional Admin",
      role: "admin",
      regionId: "pune",
      status: "APPROVED",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsVersion: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      uid: "sup_solapur_1",
      email: "sup-solapur-active@wana.org",
      name: "Ramesh Pawar (Active)",
      role: "supervisor",
      regionId: "solapur",
      status: "APPROVED",
      approvedBy: "admin_solapur_uid",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsVersion: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      uid: "sup_solapur_2",
      email: "sup-solapur-pending@wana.org",
      name: "Anjali Shinde (Pending)",
      role: "supervisor",
      regionId: "solapur",
      status: "PENDING",
      claimsVersion: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      uid: "sup_pune_1",
      email: "sup-pune-active@wana.org",
      name: "Vikram Joshi (Active)",
      role: "supervisor",
      regionId: "pune",
      status: "APPROVED",
      approvedBy: "admin_pune_uid",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsVersion: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      uid: "sup_pune_2",
      email: "sup-pune-pending@wana.org",
      name: "Pooja Kulkarni (Pending)",
      role: "supervisor",
      regionId: "pune",
      status: "PENDING",
      claimsVersion: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  for (const s of staffMembers) {
    batch.set(db.collection("staff").doc(s.uid), s);
  }

  // 3. Seed Mock Ongoing SOS Events
  const events = [
    {
      id: "event_solapur_001",
      eventId: "event_solapur_001",
      type: "MEDICAL",
      status: "DISPATCHED",
      regionId: "solapur",
      sos_clicked_by_uid: "test_victim_solapur_1",
      victimName: "Sunita Kamble",
      victimPhone: "+919876543210",
      location: {
        latitude: 17.6612,
        longitude: 75.9102,
        accuracy: 12.5,
        address: "Old Pune Naka, Solapur",
      },
      assignedSupervisorUid: "sup_solapur_1",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      id: "event_solapur_002",
      eventId: "event_solapur_002",
      type: "POLICE",
      status: "ACTIVE",
      regionId: "solapur",
      sos_clicked_by_uid: "test_victim_solapur_2",
      victimName: "Amit Jadhav",
      victimPhone: "+919876543211",
      location: {
        latitude: 17.6534,
        longitude: 75.8976,
        accuracy: 8.2,
        address: "Saat Rasta, Solapur",
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lastHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      id: "event_pune_001",
      eventId: "event_pune_001",
      type: "WOMEN_SAFETY",
      status: "ACTIVE",
      regionId: "pune",
      sos_clicked_by_uid: "test_victim_pune_1",
      victimName: "Neha Deshmukh",
      victimPhone: "+919876543212",
      location: {
        latitude: 18.5298,
        longitude: 73.8441,
        accuracy: 5.0,
        address: "FC Road, Shivajinagar, Pune",
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      lastHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  for (const ev of events) {
    batch.set(db.collection("ongoingEvents").doc(ev.id), ev);
  }

  await batch.commit();
  console.log("✅ Successfully seeded 2 regions, 7 staff records, and 3 mock emergency incidents into Emulator Firestore.");
}

if (require.main === module) {
  seedEmulator()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    });
}

module.exports = seedEmulator;
