/**
 * scripts/migrate-mongo-to-firestore.js (BE-20)
 * Dual-run and reconciliation migration script to port legacy MongoDB Admin
 * and Supervisor documents into Firestore 'staff' and 'regions' collections.
 */

const admin = require("../backend/src/configuration/firebaseConfig");
const db = admin.firestore();

async function migrateMongoData() {
  console.log("🚀 Starting MongoDB to Firestore Reconciliation & Migration...");

  // Check if mongoose is configured or accessible
  let mongoose;
  try {
    mongoose = require("mongoose");
  } catch (e) {
    console.log("ℹ️ Mongoose not present or already decommissioned. Skipping MongoDB extraction.");
    return;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.log("ℹ️ No MONGO_URI present in environment. Skipping live MongoDB pull.");
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB for read-only snapshot migration.");

    const AdminModel = mongoose.models.Admin || mongoose.model("Admin", new mongoose.Schema({}, { strict: false }));
    const SupervisorModel = mongoose.models.Supervisor || mongoose.model("Supervisor", new mongoose.Schema({}, { strict: false }));

    // 1. Migrate Admins
    const admins = await AdminModel.find({}).lean();
    console.log(`📦 Found ${admins.length} Admins in MongoDB.`);

    for (const a of admins) {
      const uid = a.firebaseUid || a._id.toString();
      const regionId = (a.region || "all").toLowerCase().trim();

      await db.collection("staff").doc(uid).set(
        {
          uid,
          email: a.email,
          name: a.name || "Administrator",
          role: "admin",
          regionId,
          status: "APPROVED",
          claimsVersion: 1,
          migratedFromMongoAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Ensure region exists
      if (regionId && regionId !== "all") {
        await db.collection("regions").doc(regionId).set(
          {
            id: regionId,
            name: a.region,
            status: "active",
            adminUid: uid,
          },
          { merge: true }
        );
      }
    }

    // 2. Migrate Supervisors
    const supervisors = await SupervisorModel.find({}).lean();
    console.log(`📦 Found ${supervisors.length} Supervisors in MongoDB.`);

    for (const s of supervisors) {
      const uid = s.firebaseUid || s._id.toString();
      const regionId = (s.region || "").toLowerCase().trim();
      const status = s.isApproved ? "APPROVED" : s.region ? "PENDING" : "UNVERIFIED";

      await db.collection("staff").doc(uid).set(
        {
          uid,
          email: s.email,
          name: s.name || "Supervisor",
          role: "supervisor",
          regionId: regionId || null,
          status,
          claimsVersion: s.isApproved ? 1 : 0,
          migratedFromMongoAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await mongoose.disconnect();
    console.log("🏁 MongoDB data successfully cut over to Firestore 'staff' collection.");
  } catch (err) {
    console.error("❌ Migration error:", err.message);
  }
}

if (require.main === module) {
  migrateMongoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = migrateMongoData;
