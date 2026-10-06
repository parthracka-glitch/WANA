/**
 * MetricsMiddleware & Prometheus Collector (BE-12)
 * High-performance, zero-overhead in-memory telemetry for Cloud Monitoring and Prometheus.
 * Tracks SOS Latency SLA (p95 budget <= 3.5s), escalation counts, and error rates.
 */

class MetricsRegistry {
  constructor() {
    this.requestsTotal = 0;
    this.statusCodes = {};
    this.latenciesMs = [];
    this.sosLatenciesMs = [];
    this.sosDispatchedCount = 0;
    this.sosEscalatedCount = 0;
    this.startTime = Date.now();
  }

  recordRequest(method, path, statusCode, durationMs) {
    this.requestsTotal++;
    this.statusCodes[statusCode] = (this.statusCodes[statusCode] || 0) + 1;

    // Track latency window (keep last 5000 samples for p95 calculation)
    this.latenciesMs.push(durationMs);
    if (this.latenciesMs.length > 5000) {
      this.latenciesMs.shift();
    }

    if (path.includes('/events/sos') && method === 'POST') {
      this.sosDispatchedCount++;
      this.sosLatenciesMs.push(durationMs);
      if (this.sosLatenciesMs.length > 1000) {
        this.sosLatenciesMs.shift();
      }
    }
  }

  recordEscalation() {
    this.sosEscalatedCount++;
  }

  calculatePercentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  getMetricsSummary() {
    const p50 = this.calculatePercentile(this.latenciesMs, 50);
    const p95 = this.calculatePercentile(this.latenciesMs, 95);
    const p99 = this.calculatePercentile(this.latenciesMs, 99);
    const sosP95 = this.calculatePercentile(this.sosLatenciesMs, 95);

    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      uptimeSeconds,
      requestsTotal: this.requestsTotal,
      statusCodes: this.statusCodes,
      latencyMs: {
        p50: Math.round(p50 * 10) / 10,
        p95: Math.round(p95 * 10) / 10,
        p99: Math.round(p99 * 10) / 10,
      },
      sos: {
        dispatchedTotal: this.sosDispatchedCount,
        escalatedTotal: this.sosEscalatedCount,
        p95LatencyMs: Math.round(sosP95 * 10) / 10,
        slaTargetMet: sosP95 <= 3500, // SLA: <= 3500ms
      },
    };
  }

  toPrometheusFormat() {
    const summary = this.getMetricsSummary();
    const lines = [
      '# HELP process_uptime_seconds Total server uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${summary.uptimeSeconds}`,
      '',
      '# HELP http_requests_total Total HTTP requests handled.',
      '# TYPE http_requests_total counter',
      `http_requests_total ${summary.requestsTotal}`,
      '',
      '# HELP http_request_duration_p95_ms P95 latency in milliseconds.',
      '# TYPE http_request_duration_p95_ms gauge',
      `http_request_duration_p95_ms ${summary.latencyMs.p95}`,
      '',
      '# HELP wana_sos_dispatched_total Total emergency SOS events ingested.',
      '# TYPE wana_sos_dispatched_total counter',
      `wana_sos_dispatched_total ${summary.sos.dispatchedTotal}`,
      '',
      '# HELP wana_sos_p95_latency_ms P95 SOS dispatch latency in milliseconds.',
      '# TYPE wana_sos_p95_latency_ms gauge',
      `wana_sos_p95_latency_ms ${summary.sos.p95LatencyMs}`,
      '',
      '# HELP wana_sos_sla_target_met 1 if p95 latency meets 3500ms SLA, 0 otherwise.',
      '# TYPE wana_sos_sla_target_met gauge',
      `wana_sos_sla_target_met ${summary.sos.slaTargetMet ? 1 : 0}`,
    ];

    for (const [code, count] of Object.entries(summary.statusCodes)) {
      lines.push(`http_requests_by_status{code="${code}"} ${count}`);
    }

    return lines.join('\n') + '\n';
  }
}

const metricsRegistry = new MetricsRegistry();

const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    const cleanPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    metricsRegistry.recordRequest(req.method, cleanPath, res.statusCode, durationMs);
  });

  next();
};

module.exports = { metricsMiddleware, metricsRegistry, MetricsRegistry };
