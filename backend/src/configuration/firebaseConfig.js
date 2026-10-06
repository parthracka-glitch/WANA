const admin = require("firebase-admin");

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID || "wana-9705e";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey && privateKey.includes("PRIVATE KEY")) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (err) {
      console.warn("⚠️ Failed to parse service account credential; falling back to projectId:", err.message);
      admin.initializeApp({ projectId });
    }
  } else {
    // Emulator or Default Project Configuration
    admin.initializeApp({ projectId });
  }
}

module.exports = admin;