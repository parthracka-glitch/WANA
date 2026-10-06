const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const admin = require("../configuration/firebaseConfig");

const db = admin.firestore();

/**
 * GET /auth/me
 * Protected identity endpoint (HF-04, BE-04, BE-20)
 * Derives caller role, region & approval status strictly from verified Firebase ID token and Firestore staff doc.
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;

    // Check staff collection in Firestore
    const staffDoc = await db.collection("staff").doc(firebaseUid).get();

    if (staffDoc.exists) {
      const staff = staffDoc.data();
      return res.status(200).json({
        uid: firebaseUid,
        role: staff.role,
        isApproved: staff.status === "APPROVED",
        status: staff.status,
        email: staff.email || req.user.email,
        name: staff.name,
        region: staff.regionId,
        regionId: staff.regionId,
        claimsVersion: staff.claimsVersion || 0,
      });
    }

    // Fallback: check if claims exist on token
    if (req.user.role) {
      return res.status(200).json({
        uid: firebaseUid,
        role: req.user.role,
        isApproved: true,
        status: "APPROVED",
        email: req.user.email || null,
        region: req.user.regionId || null,
        regionId: req.user.regionId || null,
      });
    }

    // Default: Regular citizen / unverified user
    return res.status(200).json({
      uid: firebaseUid,
      role: "user",
      isApproved: false,
      status: "UNREGISTERED",
      email: req.user.email || null,
      region: null,
      regionId: null,
    });
  } catch (error) {
    console.error("❌ Auth /me error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /auth/status/:uid
 * DEPRECATED (HF-04)
 * Deprecated to eliminate user enumeration risks. Callers must use GET /auth/me.
 */
router.get("/status/:uid", (req, res) => {
  return res.status(410).json({
    message: "Endpoint deprecated for security (user enumeration). Use authenticated GET /auth/me instead.",
    code: "ENDPOINT_DEPRECATED",
  });
});

module.exports = router;
