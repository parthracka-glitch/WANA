const { v4: uuidv4 } = require("uuid");

/**
 * Request Tracing Middleware (BE-11a)
 * Attaches a unique requestId to incoming requests and sets the X-Request-Id response header.
 */
function requestTracingMiddleware(req, res, next) {
  const incomingId = req.headers["x-request-id"];
  const requestId = incomingId && typeof incomingId === "string" && incomingId.trim().length > 0
    ? incomingId.trim()
    : uuidv4();

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startHrTime = process.hrtime();

  res.on("finish", () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedTimeInMs = (elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6).toFixed(2);
    // Structured log
    if (process.env.NODE_ENV !== "test") {
      console.log(
        JSON.stringify({
          level: "info",
          type: "request_completed",
          requestId,
          method: req.method,
          url: req.originalUrl || req.url,
          status: res.statusCode,
          durationMs: Number(elapsedTimeInMs),
          ip: req.ip || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        })
      );
    }
  });

  next();
}

module.exports = { requestTracingMiddleware };
