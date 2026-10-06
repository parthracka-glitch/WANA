const admin = require("../configuration/firebaseConfig");
const { AppError } = require("../middleware/errorHandler");
const { writeAuditLog } = require("./auditService");

const db = admin.firestore();

/**
 * Region Service (BE-02)
 * Manages region definitions and enforces the One-Admin Invariant atomically.
 */
class RegionService {
  /**
   * Get all active regions that have an assigned administrator.
   */
  static async getAvailableRegions() {
    const snapshot = await db.collection("regions").where("status", "==", "active").get();

    const regions = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Ensure only regions with an assigned admin are available for supervisor registration
      if (data.adminUid) {
        regions.push({
          id: doc.id,
          name: data.name,
          center: data.center,
          zoom: data.zoom || 12,
          adminUid: data.adminUid,
          ackSlaSeconds: data.ackSlaSeconds || 60,
          staleSeconds: data.staleSeconds || 300,
        });
      }
    });

    return regions;
  }

  /**
   * Get region details by ID
   */
  static async getRegionById(regionId) {
    const doc = await db.collection("regions").doc(regionId).get();
    if (!doc.exists) {
      throw new AppError(`Region '${regionId}' not found.`, 404, "REGION_NOT_FOUND");
    }
    return { id: doc.id, ...doc.data() };
  }

  /**
   * Create or update region with atomic One-Admin Invariant verification.
   */
  static async upsertRegion(regionData, actor = null, req = null) {
    const { id, name, center, zoom, adminUid, ackSlaSeconds, staleSeconds, fallbackRegionId } = regionData;
    const regionRef = db.collection("regions").doc(id);

    return await db.runTransaction(async (transaction) => {
      const regionDoc = await transaction.get(regionRef);

      if (regionDoc.exists) {
        const existingData = regionDoc.data();
        // One-Admin Invariant: Cannot overwrite existing adminUid with a different one without unassigning
        if (existingData.adminUid && adminUid && existingData.adminUid !== adminUid) {
          throw new AppError(
            `Region '${id}' is already administered by UID ${existingData.adminUid}. Cannot reassign without explicit revocation.`,
            409,
            "ONE_ADMIN_INVARIANT_VIOLATION"
          );
        }

        const updatePayload = {
          name: name || existingData.name,
          center: center || existingData.center,
          zoom: zoom !== undefined ? zoom : existingData.zoom,
          status: "active",
          ackSlaSeconds: ackSlaSeconds || existingData.ackSlaSeconds || 60,
          staleSeconds: staleSeconds || existingData.staleSeconds || 300,
          fallbackRegionId: fallbackRegionId || existingData.fallbackRegionId || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (adminUid !== undefined) {
          updatePayload.adminUid = adminUid;
        }

        transaction.update(regionRef, updatePayload);

        if (actor) {
          await writeAuditLog({
            actorUid: actor.uid,
            actorRole: actor.role,
            action: "UPDATE_REGION",
            targetId: id,
            regionId: id,
            details: updatePayload,
            req,
          });
        }

        return { id, ...existingData, ...updatePayload };
      } else {
        // Create new region
        const newRegion = {
          id,
          name,
          center,
          zoom: zoom || 12,
          adminUid: adminUid || null,
          status: "active",
          ackSlaSeconds: ackSlaSeconds || 60,
          staleSeconds: staleSeconds || 300,
          fallbackRegionId: fallbackRegionId || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        transaction.set(regionRef, newRegion);

        if (actor) {
          await writeAuditLog({
            actorUid: actor.uid,
            actorRole: actor.role,
            action: "CREATE_REGION",
            targetId: id,
            regionId: id,
            details: newRegion,
            req,
          });
        }

        return newRegion;
      }
    });
  }
}

module.exports = RegionService;
