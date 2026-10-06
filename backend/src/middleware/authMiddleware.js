const admin = require("../configuration/firebaseConfig");

const db = admin.firestore();

/**
 * Authentication Middleware (HF-04, BE-04, BE-20)
 * Verifies Firebase ID Token and resolves identity strictly from verified token
 * and the authoritative Firestore 'staff' collection.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "No authentication token provided.",
          requestId: req.id || req.requestId || null,
        },
      });
    }

    const token = authHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    const uid = decodedToken.uid;
    const email = decodedToken.email || null;

    // Fast-path: Check Firestore staff collection
    const staffDoc = await db.collection("staff").doc(uid).get();

    if (staffDoc.exists) {
      const staffData = staffDoc.data();
      req.user = {
        uid,
        email: staffData.email || email,
        name: staffData.name || null,
        role: staffData.role || "supervisor",
        region: staffData.regionId,
        regionId: staffData.regionId,
        status: staffData.status,
        isApproved: staffData.status === "APPROVED",
        claimsVersion: staffData.claimsVersion || 0,
      };
      return next();
    }

    // Fallback: Check if claims exist on decoded token
    if (decodedToken.role) {
      req.user = {
        uid,
        email,
        name: decodedToken.name || null,
        role: decodedToken.role,
        region: decodedToken.regionId || null,
        regionId: decodedToken.regionId || null,
        status: "APPROVED",
        isApproved: true,
        claimsVersion: decodedToken.claimsVersion || 0,
      };
      return next();
    }

    // Default: Regular citizen / victim user
    req.user = {
      uid,
      email,
      name: decodedToken.name || null,
      role: "user",
      region: null,
      regionId: null,
      status: "UNREGISTERED",
      isApproved: false,
    };

    next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error.message);
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid or expired authentication token.",
        requestId: req.id || req.requestId || null,
      },
    });
  }
};

/**
 * Optional Authentication Middleware
 * If a token is provided, decodes and attaches user; otherwise allows request to proceed as anonymous.
 */
const optionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email || null;

    const staffDoc = await db.collection("staff").doc(uid).get();
    if (staffDoc.exists) {
      const staffData = staffDoc.data();
      req.user = {
        uid,
        email: staffData.email || email,
        name: staffData.name || null,
        role: staffData.role || "supervisor",
        region: staffData.regionId,
        regionId: staffData.regionId,
        status: staffData.status,
        isApproved: staffData.status === "APPROVED",
        claimsVersion: staffData.claimsVersion || 0,
      };
    } else {
      req.user = {
        uid,
        email,
        name: decodedToken.name || null,
        role: decodedToken.role || "user",
        region: decodedToken.regionId || null,
        regionId: decodedToken.regionId || null,
        status: "APPROVED",
        isApproved: true,
      };
    }
    next();
  } catch {
    req.user = null;
    next();
  }
};

module.exports = { authMiddleware, optionalAuthMiddleware };