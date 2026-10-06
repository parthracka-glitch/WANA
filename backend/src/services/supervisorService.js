const admin = require("../configuration/firebaseConfig");
const { AppError } = require("../middleware/errorHandler");
const { writeAuditLog } = require("./auditService");
const AuthService = require("./authService");

const db = admin.firestore();

/**
 * Supervisor State Machine Service (BE-03, BE-18)
 * Manages supervisor profile registration, approval, rejection, suspension, and reinstatement.
 */
class SupervisorService {
  /**
   * Register a new supervisor profile (UNVERIFIED / PENDING state)
   */
  static async registerSupervisor({ uid, email, name, phone, regionId }, req = null) {
    const staffRef = db.collection("staff").doc(uid);

    // Validate region exists and has an admin
    const regionDoc = await db.collection("regions").doc(regionId).get();
    if (!regionDoc.exists || !regionDoc.data().adminUid) {
      throw new AppError(
        `Region '${regionId}' is invalid or not currently accepting supervisors.`,
        400,
        "INVALID_REGION"
      );
    }

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(staffRef);

      if (doc.exists) {
        const data = doc.data();
        if (data.status === "APPROVED") {
          throw new AppError("Account is already approved as a staff member.", 409, "ALREADY_APPROVED");
        }
        if (data.status === "PENDING") {
          throw new AppError("Application is already pending approval by your regional admin.", 409, "ALREADY_PENDING");
        }
      }

      const supervisorDoc = {
        uid,
        email,
        name,
        phone: phone || null,
        role: "supervisor",
        regionId,
        status: "PENDING",
        approvedBy: null,
        approvedAt: null,
        rejectReason: null,
        claimsVersion: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.set(staffRef, supervisorDoc);
      return supervisorDoc;
    });

    await writeAuditLog({
      actorUid: uid,
      actorRole: "supervisor",
      action: "REGISTER_SUPERVISOR_APPLICATION",
      targetId: uid,
      regionId,
      details: { email, name, phone, regionId },
      req,
    });

    return result;
  }

  /**
   * Approve a pending supervisor (PENDING -> APPROVED)
   */
  static async approveSupervisor(supervisorUid, adminActor, req = null) {
    const staffRef = db.collection("staff").doc(supervisorUid);

    const updated = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(staffRef);
      if (!doc.exists) {
        throw new AppError("Supervisor profile not found.", 404, "STAFF_NOT_FOUND");
      }

      const data = doc.data();

      // Regional isolation check: Regional admin must match supervisor's region
      if (adminActor.role !== "admin" && adminActor.role !== "superadmin") {
        throw new AppError("Only administrators can approve supervisors.", 403, "FORBIDDEN");
      }
      if (adminActor.regionId !== "all" && adminActor.regionId !== data.regionId) {
        throw new AppError(
          `Unauthorized to approve supervisor in region '${data.regionId}'.`,
          403,
          "CROSS_REGION_FORBIDDEN"
        );
      }

      if (data.status !== "PENDING") {
        throw new AppError(
          `Cannot approve supervisor with status '${data.status}'. Must be PENDING.`,
          400,
          "INVALID_STATE_TRANSITION"
        );
      }

      const newClaimsVersion = (data.claimsVersion || 0) + 1;
      const updateData = {
        status: "APPROVED",
        approvedBy: adminActor.uid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectReason: null,
        claimsVersion: newClaimsVersion,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.update(staffRef, updateData);
      return { ...data, ...updateData, newClaimsVersion };
    });

    // Synchronize Firebase Auth Custom Claims (role: supervisor, regionId)
    await AuthService.setStaffClaims(supervisorUid, "supervisor", updated.regionId);

    await writeAuditLog({
      actorUid: adminActor.uid,
      actorRole: adminActor.role,
      action: "APPROVE_SUPERVISOR",
      targetId: supervisorUid,
      regionId: updated.regionId,
      details: { supervisorUid, claimsVersion: updated.newClaimsVersion },
      req,
    });

    return updated;
  }

  /**
   * Reject a pending supervisor with mandatory reason (PENDING -> REJECTED)
   */
  static async rejectSupervisor(supervisorUid, reason, adminActor, req = null) {
    if (!reason || reason.trim().length < 5) {
      throw new AppError("Rejection reason must be at least 5 characters.", 400, "MISSING_REASON");
    }

    const staffRef = db.collection("staff").doc(supervisorUid);

    const updated = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(staffRef);
      if (!doc.exists) {
        throw new AppError("Supervisor profile not found.", 404, "STAFF_NOT_FOUND");
      }

      const data = doc.data();

      // Regional isolation check
      if (adminActor.regionId !== "all" && adminActor.regionId !== data.regionId) {
        throw new AppError(
          `Unauthorized to reject supervisor in region '${data.regionId}'.`,
          403,
          "CROSS_REGION_FORBIDDEN"
        );
      }

      if (data.status !== "PENDING") {
        throw new AppError(
          `Cannot reject supervisor with status '${data.status}'. Must be PENDING.`,
          400,
          "INVALID_STATE_TRANSITION"
        );
      }

      const updateData = {
        status: "REJECTED",
        rejectReason: reason.trim(),
        rejectedBy: adminActor.uid,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.update(staffRef, updateData);
      return { ...data, ...updateData };
    });

    // Revoke any claims
    await AuthService.revokeStaffAccess(supervisorUid);

    await writeAuditLog({
      actorUid: adminActor.uid,
      actorRole: adminActor.role,
      action: "REJECT_SUPERVISOR",
      targetId: supervisorUid,
      regionId: updated.regionId,
      details: { supervisorUid, reason: reason.trim() },
      req,
    });

    return updated;
  }

  /**
   * Suspend an approved supervisor (APPROVED -> SUSPENDED)
   * Wipes claims and invalidates active refresh tokens immediately.
   */
  static async suspendSupervisor(supervisorUid, reason, adminActor, req = null) {
    const staffRef = db.collection("staff").doc(supervisorUid);

    const updated = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(staffRef);
      if (!doc.exists) {
        throw new AppError("Supervisor profile not found.", 404, "STAFF_NOT_FOUND");
      }

      const data = doc.data();

      // Regional isolation check
      if (adminActor.regionId !== "all" && adminActor.regionId !== data.regionId) {
        throw new AppError(
          `Unauthorized to suspend supervisor in region '${data.regionId}'.`,
          403,
          "CROSS_REGION_FORBIDDEN"
        );
      }

      if (data.status !== "APPROVED") {
        throw new AppError(
          `Cannot suspend supervisor with status '${data.status}'. Must be APPROVED.`,
          400,
          "INVALID_STATE_TRANSITION"
        );
      }

      const newClaimsVersion = (data.claimsVersion || 0) + 1;
      const updateData = {
        status: "SUSPENDED",
        suspendedBy: adminActor.uid,
        suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
        suspensionReason: reason || "Administrative suspension",
        claimsVersion: newClaimsVersion,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.update(staffRef, updateData);
      return { ...data, ...updateData };
    });

    // Revoke claims and tokens immediately
    await AuthService.revokeStaffAccess(supervisorUid);

    await writeAuditLog({
      actorUid: adminActor.uid,
      actorRole: adminActor.role,
      action: "SUSPEND_SUPERVISOR",
      targetId: supervisorUid,
      regionId: updated.regionId,
      details: { supervisorUid, reason },
      req,
    });

    return updated;
  }

  /**
   * Reinstate a suspended supervisor (SUSPENDED -> APPROVED)
   */
  static async reinstateSupervisor(supervisorUid, reason, adminActor, req = null) {
    const staffRef = db.collection("staff").doc(supervisorUid);

    const updated = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(staffRef);
      if (!doc.exists) {
        throw new AppError("Supervisor profile not found.", 404, "STAFF_NOT_FOUND");
      }

      const data = doc.data();

      // Regional isolation check
      if (adminActor.regionId !== "all" && adminActor.regionId !== data.regionId) {
        throw new AppError(
          `Unauthorized to reinstate supervisor in region '${data.regionId}'.`,
          403,
          "CROSS_REGION_FORBIDDEN"
        );
      }

      if (data.status !== "SUSPENDED") {
        throw new AppError(
          `Cannot reinstate supervisor with status '${data.status}'. Must be SUSPENDED.`,
          400,
          "INVALID_STATE_TRANSITION"
        );
      }

      const newClaimsVersion = (data.claimsVersion || 0) + 1;
      const updateData = {
        status: "APPROVED",
        reinstatedBy: adminActor.uid,
        reinstatedAt: admin.firestore.FieldValue.serverTimestamp(),
        reinstateReason: reason || "Reinstated by administrator",
        claimsVersion: newClaimsVersion,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.update(staffRef, updateData);
      return { ...data, ...updateData };
    });

    // Restore claims
    await AuthService.setStaffClaims(supervisorUid, "supervisor", updated.regionId);

    await writeAuditLog({
      actorUid: adminActor.uid,
      actorRole: adminActor.role,
      action: "REINSTATE_SUPERVISOR",
      targetId: supervisorUid,
      regionId: updated.regionId,
      details: { supervisorUid, reason },
      req,
    });

    return updated;
  }

  /**
   * List supervisors scoped by regional access
   */
  static async getSupervisorsByRegion(adminActor, statusFilter = null) {
    let query = db.collection("staff").where("role", "==", "supervisor");

    if (adminActor.regionId !== "all") {
      query = query.where("regionId", "==", adminActor.regionId);
    }

    if (statusFilter) {
      query = query.where("status", "==", statusFilter);
    }

    const snapshot = await query.get();
    const supervisors = [];
    snapshot.forEach((doc) => {
      supervisors.push({ id: doc.id, ...doc.data() });
    });
    return supervisors;
  }
}

module.exports = SupervisorService;
