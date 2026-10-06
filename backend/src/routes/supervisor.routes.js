const express = require("express");
const router = express.Router();
const admin = require("../configuration/firebaseConfig");
const { authMiddleware } = require("../middleware/authMiddleware");
const SupervisorService = require("../services/supervisorService");
const { validate, supervisorRegistrationSchema } = require("../validators");
const { AppError } = require("../middleware/errorHandler");

const db = admin.firestore();

/**
 * 1. POST /supervisor/register
 * Initial profile registration or onboarding step.
 * Derives UID strictly from verified token (HF-04, BE-03, BE-20).
 */
router.post("/register", authMiddleware, validate(supervisorRegistrationSchema, "body"), async (req, res, next) => {
  try {
    const { name, phone, regionId } = req.body;
    const uid = req.user.uid;
    const email = req.user.email;

    const supervisor = await SupervisorService.registerSupervisor(
      { uid, email, name, phone, regionId },
      req
    );

    res.status(201).json({
      message: "Application submitted. Your regional administrator will review your application.",
      supervisor,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. GET /supervisor/status/:uid
 * DEPRECATED (HF-04)
 */
router.get("/status/:uid", (req, res) => {
  return res.status(410).json({
    message: "Endpoint deprecated for security. Use authenticated GET /auth/me instead.",
    code: "ENDPOINT_DEPRECATED",
  });
});

/**
 * 3. PATCH /supervisor/complete-profile
 * Triggered when supervisor selects a region on CompleteProfile.jsx.
 */
router.patch("/complete-profile", authMiddleware, async (req, res, next) => {
  try {
    const region = req.body.region || req.body.regionId;
    const uid = req.user.uid;
    const email = req.user.email;

    if (!region) {
      throw new AppError("Region selection is required.", 400, "MISSING_REGION");
    }

    const regionId = region.trim().toLowerCase();

    // Check existing staff record or create
    const staffDoc = await db.collection("staff").doc(uid).get();
    const existingName = staffDoc.exists ? staffDoc.data().name : (req.body.name || "Supervisor Candidate");

    const supervisor = await SupervisorService.registerSupervisor(
      {
        uid,
        email,
        name: existingName,
        phone: req.body.phone || null,
        regionId,
      },
      req
    );

    res.status(200).json({
      message: "Profile updated, application sent to regional Admin.",
      supervisor,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. GET /supervisor/profile
 * Returns profile for the authenticated supervisor.
 */
router.get("/profile", authMiddleware, async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const staffDoc = await db.collection("staff").doc(uid).get();

    if (!staffDoc.exists) {
      throw new AppError("Supervisor profile not found.", 404, "PROFILE_NOT_FOUND");
    }

    const data = staffDoc.data();
    res.status(200).json({
      uid: data.uid,
      name: data.name,
      email: data.email,
      role: data.role,
      region: data.regionId,
      regionId: data.regionId,
      status: data.status,
      isApproved: data.status === "APPROVED",
      claimsVersion: data.claimsVersion || 0,
      createdAt: data.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;