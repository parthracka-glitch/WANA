/**
 * scripts/sos-simulator.js (QA-01)
 * CLI Incident Simulator for local emulator and staging drills.
 * Usage: node scripts/sos-simulator.js --region solapur --count 3 --type MEDICAL --env local
 */

const { v4: uuidv4 } = require("uuid");

// Determine emulator host
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = require("../Wanna-web-supervisor-admin-main/Wanna-web-supervisor-admin-main/backend/src/configuration/firebaseConfig");
const db = admin.firestore();

// Regional center coordinates
const REGION_CENTERS = {
  solapur: { lat: 17.6599, lng: 75.9064, name: "Solapur" },
  pune: { lat: 18.5204, lng: 73.8567, name: "Pune" },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    region: "solapur",
    count: 1,
    type: "MEDICAL",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--region" && args[i + 1]) params.region = args[i + 1].toLowerCase();
    if (args[i] === "--count" && args[i + 1]) params.count = parseInt(args[i + 1], 10);
    if (args[i] === "--type" && args[i + 1]) params.type = args[i + 1].toUpperCase();
  }
  return params;
}

async function simulateIncidents() {
  const { region, count, type } = parseArgs();
  const regionConfig = REGION_CENTERS[region] || REGION_CENTERS.solapur;

  console.log(`🚨 Simulating ${count} '${type}' incidents in region: ${region}...`);

  const batch = db.batch();
  const createdIds = [];

  for (let i = 0; i < count; i++) {
    const eventId = `sim_sos_${Date.now()}_${uuidv4().substring(0, 8)}`;
    // Small jitter (+/- 0.015 degrees ~ 1.5km)
    const latJitter = (Math.random() - 0.5) * 0.03;
    const lngJitter = (Math.random() - 0.5) * 0.03;

    const eventDoc = {
      id: eventId,
      eventId,
      type,
      status: "CREATED",
      regionId: region,
      region: region,
      sos_clicked_by_uid: `sim_user_${uuidv4().substring(0, 6)}`,
      victimName: `Drill Victim ${i + 1}`,
      victimPhone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
      location: {
        latitude: regionConfig.lat + latJitter,
        longitude: regionConfig.lng + lngJitter,
        accuracy: Math.round(5 + Math.random() * 15),
        address: `Simulation Point near ${regionConfig.name}`,
      },
      batteryLevel: Math.floor(20 + Math.random() * 80),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
      lastHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
      is_resolved: false,
      isSimulated: true,
    };

    const docRef = db.collection("ongoingEvents").doc(eventId);
    batch.set(docRef, eventDoc);
    createdIds.push(eventId);
  }

  await batch.commit();
  console.log(`✅ Successfully seeded ${createdIds.length} simulated incidents:`);
  createdIds.forEach((id) => console.log(`   - ongoingEvents/${id}`));
}

if (require.main === module) {
  simulateIncidents()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Simulation failed:", err);
      process.exit(1);
    });
}

module.exports = simulateIncidents;
