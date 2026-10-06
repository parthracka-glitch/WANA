const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const { authMiddleware } = require("./middleware/authMiddleware");
const { requestTracingMiddleware } = require("./middleware/requestTracing");
const { metricsMiddleware, metricsRegistry } = require("./middleware/metricsMiddleware");
const { appCheckMiddleware } = require("./middleware/appCheckMiddleware");
const { errorHandler } = require("./middleware/errorHandler");

// Routes
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const supervisorRoutes = require("./routes/supervisor.routes");
const logsRoutes = require("./routes/logs.routes");
const cleanupRoutes = require("./routes/cleanup.routes");
const eventsRoutes = require("./routes/events.routes");
const regionRoutes = require("./routes/region.routes");
const internalRoutes = require("./routes/internal.routes");
const responderRoutes = require("./routes/responder.routes");
const contactsRoutes = require("./routes/contacts.routes");
const evidenceRoutes = require("./routes/evidence.routes");
const riskRoutes = require("./routes/risk.routes");
const tacticalChatRoutes = require("./routes/tacticalChat.routes");
const legalDossierRoutes = require("./routes/legalDossier.routes");
const smsUplinkRoutes = require("./routes/smsUplink.routes");
const interopRoutes = require("./routes/interop.routes");
const bootstrapAdmins = require("./scripts/bootstrap-admin");

const app = express();

// Request Tracing (BE-11a)
app.use(requestTracingMiddleware);

// Observability & Metrics Telemetry (BE-12)
app.use(metricsMiddleware);

// Security Headers (HF-06)
app.use(helmet());

// CORS Configuration with strict allowlist (HF-06)
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      return callback(new Error("Blocked by CORS policy"));
    },
    credentials: true,
  })
);

// Body parser limits (HF-06: DOS mitigation, with expanded limit for multimedia evidence - BE-09)
app.use("/evidence", express.json({ limit: "15mb" }));
app.use(express.json({ limit: "50kb" }));

// Rate Limiting (HF-06)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication requests, please try again later." },
});

// Health Check & Observability Endpoints (BE-12)
app.get("/healthz", (req, res) => res.status(200).json({ status: "ok" }));
app.get("/readyz", (req, res) => res.status(200).json({ status: "ready" }));
app.get("/metrics", (req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(metricsRegistry.toPrometheusFormat());
});
app.get("/healthz/metrics", (req, res) => res.status(200).json(metricsRegistry.getMetricsSummary()));

// Firebase App Check Validation for Client Requests (BE-11)
app.use(appCheckMiddleware);

// Public Routes (Rate limited)
app.use("/auth", authLimiter, authRoutes);
app.use("/regions", regionRoutes);

// Protected Routes
app.use("/admin", authMiddleware, adminRoutes);
app.use("/supervisor", supervisorRoutes);
app.use("/logs", logsRoutes);
app.use("/cleanup", authMiddleware, cleanupRoutes);
app.use("/events", eventsRoutes);
app.use("/internal", internalRoutes);
app.use("/responders", responderRoutes);
app.use("/contacts", contactsRoutes);
app.use("/evidence", evidenceRoutes);
app.use("/risk", riskRoutes);
app.use("/sms-uplink", smsUplinkRoutes);
app.use("/events/sms-uplink", smsUplinkRoutes);
app.use("/tactical-chat", tacticalChatRoutes);
app.use("/events/tactical-chat", tacticalChatRoutes);
app.use("/dossier", legalDossierRoutes);
app.use("/events/dossier", legalDossierRoutes);
app.use("/interop", interopRoutes);

// Global Error Handler (BE-11a: standard { error: { code, message, requestId } } envelope)
app.use(errorHandler);

// Start server (Decommissioned MongoDB: starts cleanly on Firestore - BE-20)
const PORT = process.env.PORT || 3000;

let server;
if (process.env.NODE_ENV !== "test") {
  bootstrapAdmins().catch((err) => {
    console.warn("⚠️ Non-fatal: Regional Admin bootstrap encountered warning:", err.message);
  });

  server = app.listen(PORT, () => {
    console.log(`🚀 WANA Secure Core Server running on port ${PORT}`);
  });

  // Graceful shutdown hooks (BE-11a)
  const shutdown = () => {
    console.log("🛑 Gracefully shutting down WANA API server...");
    if (server) {
      server.close(() => {
        console.log("✅ HTTP server closed.");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

module.exports = app;
