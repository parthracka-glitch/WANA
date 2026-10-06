const express = require("express");
const router = express.Router();
const SupervisorService = require("../services/supervisorService");
const { requireRole } = require("../middleware/rbacMiddleware");
const { validate, supervisorActionSchema, supervisorOptionalReasonSchema } = require("../validators");

// All routes here require admin role
router.use(requireRole(["admin", "superadmin"]));

/**
 * GET /admin/supervisors/pending (BE-03)
 * Fetches pending supervisors scoped by administrator's region.
 */
router.get("/supervisors/pending", async (req, res, next) => {
  try {
    const pending = await SupervisorService.getSupervisorsByRegion(req.user, "PENDING");
    res.status(200).json(pending);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/supervisors/approved (BE-03)
 * Fetches approved supervisors scoped by administrator's region.
 */
router.get("/supervisors/approved", async (req, res, next) => {
  try {
    const approved = await SupervisorService.getSupervisorsByRegion(req.user, "APPROVED");
    res.status(200).json(approved);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/supervisors (FE-09)
 * Fetches all supervisors in region with optional status query param.
 */
router.get("/supervisors", async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const supervisors = await SupervisorService.getSupervisorsByRegion(req.user, status);
    res.status(200).json(supervisors);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/supervisors/:id/approve (BE-03)
 * Approves a supervisor, synchronizes custom claims, and increments claimsVersion.
 */
router.patch("/supervisors/:id/approve", async (req, res, next) => {
  try {
    const updated = await SupervisorService.approveSupervisor(req.params.id, req.user, req);
    res.status(200).json({
      message: "Supervisor approved successfully",
      supervisor: updated,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/supervisors/:id/reject (BE-03, FE-09)
 * Rejects a supervisor with mandatory reason text.
 */
router.patch(
  "/supervisors/:id/reject",
  validate(supervisorActionSchema, "body"),
  async (req, res, next) => {
    try {
      const updated = await SupervisorService.rejectSupervisor(
        req.params.id,
        req.body.reason,
        req.user,
        req
      );
      res.status(200).json({
        message: "Supervisor application rejected",
        supervisor: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /admin/supervisors/:id/suspend (BE-03, FE-09)
 * Suspends an approved supervisor and revokes tokens/claims immediately.
 */
router.patch(
  "/supervisors/:id/suspend",
  validate(supervisorActionSchema, "body"),
  async (req, res, next) => {
    try {
      const updated = await SupervisorService.suspendSupervisor(
        req.params.id,
        req.body.reason,
        req.user,
        req
      );
      res.status(200).json({
        message: "Supervisor suspended and access tokens revoked immediately",
        supervisor: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /admin/supervisors/:id/reinstate (BE-03, FE-09)
 * Reinstates a suspended supervisor.
 */
router.patch(
  "/supervisors/:id/reinstate",
  validate(supervisorOptionalReasonSchema, "body"),
  async (req, res, next) => {
    try {
      const updated = await SupervisorService.reinstateSupervisor(
        req.params.id,
        req.body.reason || "Reinstated by admin",
        req.user,
        req
      );
      res.status(200).json({
        message: "Supervisor reinstated successfully",
        supervisor: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /admin/supervisors/:id/revoke (Legacy alias mapping to suspend)
 */
router.patch("/supervisors/:id/revoke", async (req, res, next) => {
  try {
    const updated = await SupervisorService.suspendSupervisor(
      req.params.id,
      req.body.reason || "Administrative revocation",
      req.user,
      req
    );
    res.status(200).json({
      message: "Supervisor access revoked successfully",
      supervisor: updated,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/dashboard/summary (FE-08)
 * Aggregated administrative metrics for regional operations.
 */
router.get("/dashboard/summary", async (req, res, next) => {
  try {
    const admin = require("../configuration/firebaseConfig");
    const db = admin.firestore();

    const adminRegion = (req.user.regionId || req.user.region || "all").toString().toLowerCase().trim();
    const targetRegion = (req.query.regionId || adminRegion).toString().toLowerCase().trim();

    // 1. Ongoing Events
    let ongoingQuery = db.collection("ongoingEvents").where("is_resolved", "==", false);
    if (adminRegion !== "all") {
      ongoingQuery = ongoingQuery.where("regionId", "==", adminRegion);
    } else if (targetRegion && targetRegion !== "all") {
      ongoingQuery = ongoingQuery.where("regionId", "==", targetRegion);
    }

    const ongoingSnap = await ongoingQuery.get();
    let totalActive = 0;
    let dispatched = 0;
    let acknowledged = 0;
    let escalated = 0;
    let stale = 0;

    ongoingSnap.forEach((doc) => {
      totalActive++;
      const data = doc.data();
      if (data.status === "DISPATCHED") dispatched++;
      if (data.status === "ACKNOWLEDGED") acknowledged++;
      if (data.status === "ESCALATED") escalated++;
      if (data.stale) stale++;
    });

    // 2. Past Events
    let pastQuery = db.collection("pastEvents");
    if (adminRegion !== "all") {
      pastQuery = pastQuery.where("regionId", "==", adminRegion);
    } else if (targetRegion && targetRegion !== "all") {
      pastQuery = pastQuery.where("regionId", "==", targetRegion);
    }

    const pastSnap = await pastQuery.get();
    const totalResolved = pastSnap.size;

    // 3. Supervisor Roster
    let staffQuery = db.collection("staff").where("role", "==", "supervisor");
    if (adminRegion !== "all") {
      staffQuery = staffQuery.where("regionId", "==", adminRegion);
    }

    const staffSnap = await staffQuery.get();
    let approvedSupervisors = 0;
    let pendingSupervisors = 0;
    let suspendedSupervisors = 0;

    staffSnap.forEach((doc) => {
      const s = doc.data();
      if (s.status === "APPROVED") approvedSupervisors++;
      if (s.status === "PENDING") pendingSupervisors++;
      if (s.status === "SUSPENDED") suspendedSupervisors++;
    });

    res.status(200).json({
      region: adminRegion,
      targetRegion,
      metrics: {
        events: {
          totalActive,
          dispatched,
          acknowledged,
          escalated,
          stale,
          totalResolved,
        },
        supervisors: {
          total: staffSnap.size,
          approved: approvedSupervisors,
          pending: pendingSupervisors,
          suspended: suspendedSupervisors,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;