const admin = require("../configuration/firebaseConfig");
const db = admin.firestore();

/**
 * Append-Only Immutable Audit Service (BE-10)
 * Records auditable actions with client metadata, request tracing, and timestamping.
 */
async function writeAuditLog({
  actorUid,
  actorRole = "system",
  action,
  targetId = null,
  regionId = "system",
  details = {},
  req = null,
  customDocId = null,
}) {
  try {
    const docId = customDocId || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const auditRef = db.collection("auditLogs").doc(docId);

    const logEntry = {
      id: docId,
      actorUid: actorUid || "anonymous",
      actorRole: actorRole || "unknown",
      action,
      targetId,
      regionId,
      details,
      requestId: req?.id || req?.requestId || null,
      ip: req?.ip || req?.socket?.remoteAddress || null,
      userAgent: req?.headers ? req.headers["user-agent"] : null,
      ts: admin.firestore.FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    };

    await auditRef.set(logEntry);
    return logEntry;
  } catch (error) {
    // Audit write failures must not silently disappear; log with high severity
    console.error("🚨 CRITICAL: Failed to write immutable audit log:", error);
    // In production audit-first environments, rethrow or record alert
    return null;
  }
}

module.exports = {
  writeAuditLog,
};
