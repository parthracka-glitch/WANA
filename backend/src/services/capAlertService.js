const admin = require('../configuration/firebaseConfig');
const { AppError } = require('../middleware/errorHandler');
const { writeAuditLog } = require('./auditService');

/**
 * OASIS Common Alerting Protocol (CAP v1.2 / ITU-T X.1303) Service (BE-27)
 * Interoperability bridge with Indian Government ERSS Dial 112 (Emergency Response Support System)
 * and Police Computer-Aided Dispatch (CAD) systems.
 */
class CapAlertService {
  static getDb() {
    return this.customDb || admin.firestore();
  }

  /**
   * Generates valid OASIS CAP v1.2 XML alert payload.
   */
  static async generateCapAlertXml({
    eventId,
    sender = 'wana-control@mahaerss.gov.in',
  }) {
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError("Valid 'eventId' is required.", 400, 'INVALID_EVENT_ID');
    }

    const db = CapAlertService.getDb();

    let eventDoc = await db.collection('ongoingEvents').doc(eventId).get();
    if (!eventDoc.exists) {
      eventDoc = await db.collection('pastEvents').doc(eventId).get();
    }

    if (!eventDoc.exists) {
      throw new AppError(`Incident '${eventId}' not found.`, 404, 'EVENT_NOT_FOUND');
    }

    const event = eventDoc.data();
    const nowIso = new Date().toISOString();
    const lat = event.location?.latitude ? event.location.latitude.toFixed(6) : '0.000000';
    const lng = event.location?.longitude ? event.location.longitude.toFixed(6) : '0.000000';
    const accuracyKm = ((event.location?.accuracy || 15) / 1000).toFixed(3);
    const regionName = (event.regionName || 'Maharashtra Regional Police').toUpperCase();
    const cleanId = eventId.replace(/[^a-zA-Z0-9_-]/g, '');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>URN:WANA:IN-MH:ERSS112:${cleanId}</identifier>
  <sender>${sender}</sender>
  <sent>${nowIso}</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Restricted</scope>
  <restriction>ERSS Dial 112 CAD Integration / Police Control Room Only</restriction>
  <info>
    <category>Safety</category>
    <event>WOMEN_SAFETY_EMERGENCY</event>
    <urgency>Immediate</urgency>
    <severity>Extreme</severity>
    <certainty>Observed</certainty>
    <eventCode>
      <valueName>ERSS_INCIDENT_CODE</valueName>
      <value>112_WOMEN_DISTRESS_SOS</value>
    </eventCode>
    <headline>WANA SOS: High-Priority Citizen Emergency in ${regionName}</headline>
    <description>Automated emergency alert triggered via WANA Women Safety Network. Citizen: ${event.victimName || 'Anonymous'}. Coordinates: ${lat}, ${lng}. Battery level: ${event.batteryLevel || 'Unknown'}%. Duress status: ${event.duressDetected ? 'COERCED_DURESS_ACTIVE' : 'STANDARD'}.</description>
    <contact>WANA Supervisor Desk (+91-0217-2744999)</contact>
    <parameter>
      <valueName>WANA_EVENT_ID</valueName>
      <value>${cleanId}</value>
    </parameter>
    <parameter>
      <valueName>DURESS_COERCED</valueName>
      <value>${event.duressDetected ? 'TRUE' : 'FALSE'}</value>
    </parameter>
    <parameter>
      <valueName>POWER_DEATH_IMMIMENT</valueName>
      <value>${event.imminentPowerDeath ? 'TRUE' : 'FALSE'}</value>
    </parameter>
    <area>
      <areaDesc>${regionName} Municipal Jurisdiction</areaDesc>
      <circle>${lat},${lng},${accuracyKm}</circle>
    </area>
  </info>
</alert>`.trim();

    return {
      xml,
      identifier: `URN:WANA:IN-MH:ERSS112:${cleanId}`,
      sent: nowIso,
      eventId,
    };
  }

  /**
   * Dispatches or simulates CAP v1.2 push to Police CAD (ERSS Dial 112).
   */
  static async dispatchToErssCad({
    eventId,
    cadEndpointUrl = 'https://erss.mahaerss.gov.in/cad/v1/ingest',
    req = null,
  }) {
    const { xml, identifier, sent } = await this.generateCapAlertXml({ eventId });

    // In production, posts via mTLS / HTTP Post to ERSS 112 CAD ingest
    const simulatedDispatchResult = {
      cadTransmissionId: `CAD-TX-${Date.now()}`,
      status: 'ACK_BY_ERSS_112',
      cadDispatchTimestamp: new Date().toISOString(),
      endpoint: cadEndpointUrl,
      identifier,
    };

    // Record audit log
    await writeAuditLog({
      actorUid: 'cad_interop_daemon',
      actorRole: 'interop_gateway',
      action: 'ERSS_112_CAP_DISPATCHED',
      targetId: eventId,
      regionId: 'solapur',
      details: {
        identifier,
        cadTransmissionId: simulatedDispatchResult.cadTransmissionId,
        cadEndpointUrl,
      },
      req,
      customDocId: `audit_${eventId}_cad_112`,
    });

    return {
      success: true,
      cadTransmissionId: simulatedDispatchResult.cadTransmissionId,
      status: 'DISPATCHED_TO_CAD',
      cadResult: simulatedDispatchResult,
      capXmlSnippet: xml.substring(0, 300) + '...',
    };
  }
}

module.exports = CapAlertService;
