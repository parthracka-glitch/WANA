/**
 * Standard Application Error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_SERVER_ERROR", details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global Error Handling Middleware (BE-11a)
 * Ensures standard JSON error envelope: { error: { code, message, requestId, details } }
 */
function errorHandler(err, req, res, next) {
  const requestId = req.id || req.requestId || "unknown";

  // Default values
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || "INTERNAL_SERVER_ERROR";
  let message = err.message || "An unexpected error occurred.";
  let details = err.details || null;

  // Handle Joi validation errors
  if (err.isJoi) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = err.details?.map((d) => d.message).join(", ") || "Validation failed";
    details = err.details;
  }

  // Handle Firebase Auth errors
  if (err.code && typeof err.code === "string" && err.code.startsWith("auth/")) {
    statusCode = 401;
    code = err.code.toUpperCase().replace(/\//g, "_").replace(/-/g, "_");
    message = "Authentication failed: " + err.message;
  }

  // Structured Error Logging
  if (process.env.NODE_ENV !== "test") {
    console.error(
      JSON.stringify({
        level: "error",
        type: "api_error",
        requestId,
        statusCode,
        code,
        message,
        path: req.originalUrl || req.url,
        method: req.method,
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
      })
    );
  }

  return res.status(statusCode).json({
    error: {
      code,
      message,
      requestId,
      ...(details && process.env.NODE_ENV !== "production" ? { details } : {}),
    },
  });
}

module.exports = {
  AppError,
  errorHandler,
};
