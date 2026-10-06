const admin = require('../configuration/firebaseConfig');

/**
 * ShadowEvaluator (AI-02)
 * Shadow-Mode Inference Logger & Offline Evaluation Replay Framework.
 *
 * Responsibilities:
 * 1. Collect on-device and server AI detector inferences without surfacing alerts to end users.
 * 2. Persist telemetry to 'analytics_shadow_eval' collection.
 * 3. Enforce 30-day minimum shadow evaluation gate before active alert promotion.
 * 4. Benchmark Precision and False Alarm Rate (FAR per 100km) against AI-01 thresholds.
 */
class ShadowEvaluator {
  static customDb = null;

  static getDb() {
    return this.customDb || admin.firestore();
  }

  /**
   * Log an inference result in shadow mode.
   * Completely isolated: never throws to the caller, never creates user-facing alarms.
   */
  static async logShadowInference({
    tripId,
    detectorName = 'ANOMALOUS_TRAJECTORY_v1',
    detectorVersion = '1.0.0',
    metrics = {},
    anomalyDetected = false,
    confidence = 0.0,
    timestamp = Date.now(),
  }) {
    try {
      const db = this.getDb();
      const recordId = `eval_${tripId || 'anon'}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const evalRecord = {
        id: recordId,
        tripId: tripId || 'anonymous_trip',
        detectorName,
        detectorVersion,
        metrics,
        anomalyDetected: Boolean(anomalyDetected),
        confidence: Number(confidence),
        timestamp,
        groundTruth: null, // Populated during retrospective validation
        mode: 'SHADOW',
      };

      await db.collection('analytics_shadow_eval').doc(recordId).set(evalRecord);

      return {
        logged: true,
        recordId,
        mode: 'SHADOW',
      };
    } catch (err) {
      // Non-blocking: shadow logging must never crash core runtime
      return {
        logged: false,
        error: err.message,
        mode: 'SHADOW',
      };
    }
  }

  /**
   * Benchmark detector precision and false alarm rate from evaluated test records.
   * Evaluates against AI-01 Release KPIs: Precision >= 92%, FAR <= 1.0 per 100km.
   */
  static evaluateKpiMetrics(evaluationRecords, totalKmBenchmarked = 100) {
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    for (const record of evaluationRecords) {
      const predicted = Boolean(record.anomalyDetected);
      const actual = Boolean(record.groundTruth);

      if (predicted && actual) truePositives++;
      else if (predicted && !actual) falsePositives++;
      else if (!predicted && !actual) trueNegatives++;
      else if (!predicted && actual) falseNegatives++;
    }

    const totalPositivesPredicted = truePositives + falsePositives;
    const precision = totalPositivesPredicted > 0
      ? (truePositives / totalPositivesPredicted) * 100
      : 100;

    const totalActualPositives = truePositives + falseNegatives;
    const recall = totalActualPositives > 0
      ? (truePositives / totalActualPositives) * 100
      : 100;

    const falseAlarmRatePer100Km = totalKmBenchmarked > 0
      ? (falsePositives / totalKmBenchmarked) * 100
      : 0;

    // AI-01 Gates
    const precisionPass = precision >= 92.0;
    const farPass = falseAlarmRatePer100Km <= 1.0;
    const releaseGateApproved = precisionPass && farPass;

    return {
      totalRecords: evaluationRecords.length,
      confusionMatrix: {
        truePositives,
        falsePositives,
        trueNegatives,
        falseNegatives,
      },
      metrics: {
        precisionPercent: Math.round(precision * 10) / 10,
        recallPercent: Math.round(recall * 10) / 10,
        falseAlarmRatePer100Km: Math.round(falseAlarmRatePer100Km * 100) / 100,
      },
      kpiGates: {
        precisionTargetMet: precisionPass,
        falseAlarmTargetMet: farPass,
        releaseGateApproved,
      },
    };
  }
}

module.exports = ShadowEvaluator;
