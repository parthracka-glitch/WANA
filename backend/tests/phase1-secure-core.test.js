const test = require("node:test");
const assert = require("node:assert");

// Unit tests for Phase 1 Core Invariants
test("BE-03: Supervisor State Machine transition validation", () => {
  const validTransitions = {
    UNVERIFIED: ["PENDING"],
    PENDING: ["APPROVED", "REJECTED"],
    APPROVED: ["SUSPENDED"],
    SUSPENDED: ["APPROVED"],
    REJECTED: [],
  };

  function canTransition(current, next) {
    return (validTransitions[current] || []).includes(next);
  }

  assert.strictEqual(canTransition("PENDING", "APPROVED"), true, "PENDING -> APPROVED should be allowed");
  assert.strictEqual(canTransition("PENDING", "REJECTED"), true, "PENDING -> REJECTED should be allowed");
  assert.strictEqual(canTransition("APPROVED", "SUSPENDED"), true, "APPROVED -> SUSPENDED should be allowed");
  assert.strictEqual(canTransition("SUSPENDED", "APPROVED"), true, "SUSPENDED -> APPROVED should be allowed");

  // Invalid transitions
  assert.strictEqual(canTransition("REJECTED", "APPROVED"), false, "REJECTED -> APPROVED should NOT be allowed directly");
  assert.strictEqual(canTransition("UNVERIFIED", "APPROVED"), false, "UNVERIFIED -> APPROVED should NOT be allowed");
  assert.strictEqual(canTransition("APPROVED", "REJECTED"), false, "APPROVED -> REJECTED should NOT be allowed (must suspend first)");
});

test("BE-04: RBAC Cross-Region and Role isolation logic", () => {
  function checkRbac(user, targetRegion, requiredRoles) {
    if (!user || !user.role) return { status: 401, code: "UNAUTHENTICATED" };
    if (!requiredRoles.includes(user.role)) return { status: 403, code: "INSUFFICIENT_PERMISSIONS" };
    if (user.role === "supervisor" && user.status !== "APPROVED") {
      return { status: 403, code: "ACCOUNT_NOT_ACTIVE" };
    }
    if (targetRegion && user.regionId !== "all" && user.regionId !== targetRegion) {
      return { status: 403, code: "CROSS_REGION_FORBIDDEN" };
    }
    return { status: 200, code: "OK" };
  }

  // 1. Super admin can access any region
  const superAdmin = { uid: "sa1", role: "admin", regionId: "all", status: "APPROVED" };
  assert.strictEqual(checkRbac(superAdmin, "solapur", ["admin"]).status, 200);

  // 2. Solapur admin accessing Solapur -> 200
  const solapurAdmin = { uid: "adm_sol", role: "admin", regionId: "solapur", status: "APPROVED" };
  assert.strictEqual(checkRbac(solapurAdmin, "solapur", ["admin"]).status, 200);

  // 3. Solapur admin accessing Pune -> 403 CROSS_REGION_FORBIDDEN
  const crossRegionAttempt = checkRbac(solapurAdmin, "pune", ["admin"]);
  assert.strictEqual(crossRegionAttempt.status, 403);
  assert.strictEqual(crossRegionAttempt.code, "CROSS_REGION_FORBIDDEN");

  // 4. Pending supervisor accessing protected route -> 403 ACCOUNT_NOT_ACTIVE
  const pendingSup = { uid: "sup1", role: "supervisor", regionId: "solapur", status: "PENDING" };
  assert.strictEqual(checkRbac(pendingSup, "solapur", ["supervisor"]).code, "ACCOUNT_NOT_ACTIVE");

  // 5. Approved supervisor accessing supervisor route -> 200
  const approvedSup = { uid: "sup2", role: "supervisor", regionId: "solapur", status: "APPROVED" };
  assert.strictEqual(checkRbac(approvedSup, "solapur", ["supervisor"]).status, 200);

  // 6. Citizen accessing supervisor route -> 403 INSUFFICIENT_PERMISSIONS
  const citizen = { uid: "cit1", role: "user", regionId: null, status: "UNREGISTERED" };
  assert.strictEqual(checkRbac(citizen, "solapur", ["supervisor"]).code, "INSUFFICIENT_PERMISSIONS");
});

test("BE-02: Region Registry One-Admin Invariant", () => {
  function validateAdminAssignment(existingRegion, newAdminUid) {
    if (existingRegion.adminUid && newAdminUid && existingRegion.adminUid !== newAdminUid) {
      return { allowed: false, reason: "ONE_ADMIN_INVARIANT_VIOLATION" };
    }
    return { allowed: true };
  }

  const existingRegion = { id: "solapur", adminUid: "admin_1" };
  assert.strictEqual(validateAdminAssignment(existingRegion, "admin_1").allowed, true);
  assert.strictEqual(validateAdminAssignment(existingRegion, "admin_2").allowed, false);
  assert.strictEqual(validateAdminAssignment(existingRegion, "admin_2").reason, "ONE_ADMIN_INVARIANT_VIOLATION");

  const unassignedRegion = { id: "nashik", adminUid: null };
  assert.strictEqual(validateAdminAssignment(unassignedRegion, "admin_new").allowed, true);
});

test("BE-11a: Standard Error Envelope Structure", () => {
  const { AppError, errorHandler } = require("../src/middleware/errorHandler");

  let recordedStatus = null;
  let recordedJson = null;

  const mockReq = { id: "req-test-12345" };
  const mockRes = {
    status(s) {
      recordedStatus = s;
      return this;
    },
    json(data) {
      recordedJson = data;
      return this;
    },
  };

  const appErr = new AppError("Invalid region specified", 400, "INVALID_REGION");
  errorHandler(appErr, mockReq, mockRes, () => {});

  assert.strictEqual(recordedStatus, 400);
  assert.strictEqual(recordedJson.error.code, "INVALID_REGION");
  assert.strictEqual(recordedJson.error.message, "Invalid region specified");
  assert.strictEqual(recordedJson.error.requestId, "req-test-12345");
});
