/**
 * scripts/bootstrap-admin.js (BE-02)
 * Seeds default regional admin accounts into Firestore 'staff' and 'regions' collections,
 * enforcing the One-Admin Invariant and setting Custom User Claims.
 */

const admin = require("../configuration/firebaseConfig");
const db = admin.firestore();

const DEFAULT_ADMINS = [
  {
    name: "WANA Solapur Admin",
    email: "admin.solapur@wana.com",
    uid: "W9DLMfqrWrSYN27VjLMrXXD6O983",
    regionId: "solapur",
    regionName: "Solapur",
    center: { lat: 17.6599, lng: 75.9064 },
  },
  {
    name: "WANA Pune Admin",
    email: "admin.pune@wana.com",
    uid: "D2pT46Tg5egmJQxEjEgaYM3rT6z2",
    regionId: "pune",
    regionName: "Pune",
    center: { lat: 18.5204, lng: 73.8567 },
  },
];

async function bootstrapAdmins() {
  console.log("🚀 Bootstrapping Regional Admins into Firestore (BE-02)...");

  for (const adm of DEFAULT_ADMINS) {
    const regionRef = db.collection("regions").doc(adm.regionId);
    const staffRef = db.collection("staff").doc(adm.uid);

    // 1. Check / Upsert Region with One-Admin Invariant
    const regionDoc = await regionRef.get();
    if (!regionDoc.exists) {
      await regionRef.set({
        id: adm.regionId,
        name: adm.regionName,
        center: adm.center,
        zoom: 12,
        status: "active",
        adminUid: adm.uid,
        ackSlaSeconds: 60,
        staleSeconds: 300,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ Provisioned region '${adm.regionId}' with admin UID '${adm.uid}'`);
    } else {
      const data = regionDoc.data();
      if (!data.adminUid) {
        await regionRef.update({
          adminUid: adm.uid,
          status: "active",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ Assigned admin UID '${adm.uid}' to region '${adm.regionId}'`);
      } else {
        console.log(`ℹ️ Region '${adm.regionId}' already administered by UID '${data.adminUid}'`);
      }
    }

    // 2. Provision Admin Staff Profile
    const staffDoc = await staffRef.get();
    if (!staffDoc.exists) {
      await staffRef.set({
        uid: adm.uid,
        email: adm.email,
        name: adm.name,
        role: "admin",
        regionId: adm.regionId,
        status: "APPROVED",
        claimsVersion: 1,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ Provisioned staff profile for Admin '${adm.email}'`);
    } else {
      console.log(`ℹ️ Staff profile already exists for Admin '${adm.email}'`);
    }

    // 3. Set Custom User Claims in Auth (if auth user exists in project)
    try {
      await admin.auth().setCustomUserClaims(adm.uid, {
        role: "admin",
        regionId: adm.regionId,
      });
      console.log(`✅ Configured Custom Claims { role: 'admin', regionId: '${adm.regionId}' } for '${adm.uid}'`);
    } catch (authErr) {
      // In local dev/emulator without pre-created user, log non-fatal note
      console.log(`ℹ️ Note: Custom claims sync skipped (Auth user not yet registered in Firebase Auth: ${authErr.message})`);
    }
  }

  console.log("🏁 Regional Admin bootstrap completed.");
}

if (require.main === module) {
  bootstrapAdmins()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Admin bootstrap failed:", err);
      process.exit(1);
    });
}

module.exports = bootstrapAdmins;
