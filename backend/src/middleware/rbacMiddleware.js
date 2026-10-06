const admin = require("../configuration/firebaseConfig");
const { AppError } = require("./errorHandler");
const { writeAuditLog } = require("../services/auditService");

const db = admin.firestore();

/**
 * RBAC Middleware (BE-04)
 * Enforces role verification, staff status checks, and strict regional isolation.
 */

/**
 * Enforce that the authenticated caller has one of the allowed roles.
 * @param {string[]} allowedRoles - e.g. ['admin', 'supervisor']
 */
function requireRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.uid) {
        return next(new AppError("Authentication required.", 401, "UNAUTHENTICATED"));
      }

      const uid = req.user.uid;
      let role = req.user.role;
      let regionId = req.user.regionId;
      let status = req.user.status;

      // If role not yet set in token claims or status needs verification, check staff collection
      if (!role || !status) {
        const staffDoc = await db.collection("staff").doc(uid).get();
        if (staffDoc.exists) {
          const staffData = staffDoc.data();
          role = staffData.role;
          regionId = staffData.regionId;
          status = staffData.status;

          // Hydrate req.user
          req.user.role = role;
          req.user.regionId = regionId;
          req.user.status = status;
        }
      }

      // Check role presence
      if (!role || !allowedRoles.includes(role)) {
        await writeAuditLog({
          actorUid: uid,
          actorRole: role || "unknown",
          action: "RBAC_ROLE_DENIAL",
          targetId: req.originalUrl || req.url,
          regionId: regionId || "unknown",
          details: { requiredRoles: allowedRoles, attemptedRole: role },
          req,
        });

        return next(
          new AppError(
            `Access denied. Role '${role || "unassigned"}' is not authorized.`,
            403,
            "INSUFFICIENT_PERMISSIONS"
          )
        );
      }

      // Staff status check: Must be APPROVED
      if (role === "supervisor" && status !== "APPROVED") {
        return next(
          new AppError(
            `Access denied. Supervisor status is '${status}'. Only APPROVED staff may access this resource.`,
            403,
            "ACCOUNT_NOT_ACTIVE"
          )
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Enforce that the authenticated caller has jurisdiction over the target region.
 * @param {string} sourceKey - Property to inspect ('params', 'body', 'query')
 * @param {string} paramKey - Key containing regionId (e.g. 'regionId')
 */
function requireRegion(sourceKey = "params", paramKey = "regionId") {
  return async (req, res, next) => {
    try {
      const targetRegion = req[sourceKey]?.[paramKey];
      const userRegion = req.user?.regionId;

      if (!targetRegion) {
        return next(); // Nothing to check if no target region specified
      }

      // 'all' represents super-administrative platform scope
      if (userRegion === "all") {
        return next();
      }

      if (userRegion !== targetRegion) {
        await writeAuditLog({
          actorUid: req.user?.uid || "unknown",
          actorRole: req.user?.role || "unknown",
          action: "CROSS_REGION_ACCESS_ATTEMPT",
          targetId: targetRegion,
          regionId: userRegion || "unknown",
          details: { userRegion, targetRegion, path: req.originalUrl || req.url },
          req,
        });

        return next(
          new AppError(
            `Cross-region access prohibited. You belong to region '${userRegion}', not '${targetRegion}'.`,
            403,
            "CROSS_REGION_FORBIDDEN"
          )
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  requireRole,
  requireRegion,
};
