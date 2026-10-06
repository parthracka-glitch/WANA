const express = require("express");
const router = express.Router();
const admin = require("../configuration/firebaseConfig");
const { authMiddleware } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/rbacMiddleware");
const { writeAuditLog } = require("../services/auditService");

const db = admin.firestore();

/**
 * POST /logs/create
 * Creates an audit log entry for staff actions (BE-10, BE-20)
 */
router.post("/create", authMiddleware, async (req, res, next) => {
  try {
    const { eventType, actionDescription, details } = req.body;

    const logEntry = await writeAuditLog({
      actorUid: req.user.uid,
      actorRole: req.user.role || "supervisor",
      action: eventType || "SUPERVISOR_ACTION",
      regionId: req.user.regionId || req.user.region || "unknown",
      details: {
        description: actionDescription,
        ...(details || {}),
      },
      req,
    });

    res.status(201).json({ message: "Supervisor log created", log: logEntry });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /logs/region
 * Retrieves audit logs for the administrator's region (BE-10)
 */
router.get("/region", authMiddleware, requireRole(["admin", "superadmin"]), async (req, res, next) => {
  try {
    const adminRegion = req.user.regionId || req.user.region;

    let query = db.collection("auditLogs");

    if (adminRegion && adminRegion !== "all") {
      query = query.where("regionId", "==", adminRegion);
    }

    const snapshot = await query.orderBy("ts", "desc").limit(100).get();

    const logs = [];
    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(logs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
