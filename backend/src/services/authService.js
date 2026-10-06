const admin = require("../configuration/firebaseConfig");

/**
 * Auth Service (BE-18)
 * Manages Firebase custom claims synchronization and fast session revocation.
 */
class AuthService {
  /**
   * Assign custom claims for user and synchronize claimsVersion
   */
  static async setStaffClaims(uid, role, regionId) {
    try {
      await admin.auth().setCustomUserClaims(uid, {
        role,
        regionId,
      });
      return true;
    } catch (error) {
      console.error(`Failed to set custom claims for UID ${uid}:`, error);
      throw error;
    }
  }

  /**
   * Revoke all custom claims and invalidate active refresh tokens for immediate lockout
   */
  static async revokeStaffAccess(uid) {
    try {
      await admin.auth().setCustomUserClaims(uid, {});
      await admin.auth().revokeRefreshTokens(uid);
      return true;
    } catch (error) {
      console.error(`Failed to revoke claims and tokens for UID ${uid}:`, error);
      throw error;
    }
  }
}

module.exports = AuthService;
