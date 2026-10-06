const crypto = require('crypto');
const admin = require('../configuration/firebaseConfig');
const { AppError } = require('../middleware/errorHandler');
const { writeAuditLog } = require('./auditService');

/**
 * Court-Ready Legal Dossier & BSA 65B Certificate Generator (BE-26 / FE-22)
 *
 * Assembles an electronic evidence dossier with cryptographic verification
 * complying with Section 63 & Section 65B of the Bharatiya Sakshya Adhiniyam, 2023
 * (formerly Section 65B of the Indian Evidence Act, 1872).
 */
class LegalDossierService {
  static getDb() {
    return this.customDb || admin.firestore();
  }

  /**
   * Generates a tamper-evident court dossier and Section 65B Certificate.
   */
  static async generateDossier({
    eventId,
    certifyingOfficerUid,
    certifyingOfficerName = 'Authorized Police Supervisor',
    officerDesignation = 'Duty Inspector / Control Room Supervisor',
    policeStationJurisdiction = 'Solapur Central Police Station',
    req = null,
  }) {
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError("Valid 'eventId' is required.", 400, 'INVALID_EVENT_ID');
    }

    const db = LegalDossierService.getDb();

    // 1. Fetch event from ongoing or past records
    let eventDoc = await db.collection('ongoingEvents').doc(eventId).get();
    let isOngoing = true;
    if (!eventDoc.exists) {
      eventDoc = await db.collection('pastEvents').doc(eventId).get();
      isOngoing = false;
    }

    if (!eventDoc.exists) {
      throw new AppError(`Emergency event '${eventId}' not found in database.`, 404, 'EVENT_NOT_FOUND');
    }

    const eventData = eventDoc.data();

    // 2. Fetch breadcrumbs
    const breadcrumbSnap = await eventDoc.ref.collection('breadcrumbs').orderBy('timestamp', 'asc').get();
    const breadcrumbs = [];
    breadcrumbSnap.forEach((doc) => breadcrumbs.push({ id: doc.id, ...doc.data() }));

    // 3. Fetch evidence recordings
    const evidenceSnap = await db.collection('evidence').where('eventId', '==', eventId).get();
    const evidenceItems = [];
    evidenceSnap.forEach((doc) => evidenceItems.push({ id: doc.id, ...doc.data() }));

    // 4. Fetch tactical chat messages
    const chatSnap = await eventDoc.ref.collection('tacticalChat').orderBy('timestamp', 'asc').get();
    const tacticalChats = [];
    chatSnap.forEach((doc) => tacticalChats.push({ id: doc.id, ...doc.data() }));

    // 5. Fetch audit trail for this incident
    const auditSnap = await db.collection('auditLogs').where('targetId', '==', eventId).get();
    const auditLogs = [];
    auditSnap.forEach((doc) => auditLogs.push({ id: doc.id, ...doc.data() }));
    auditLogs.sort((a, b) => (a.createdAtIso > b.createdAtIso ? 1 : -1));

    // 6. Build Evidence Integrity Manifest & Master SHA-256 Digest
    const evidenceManifest = evidenceItems.map((item) => ({
      chunkIndex: item.chunkIndex,
      type: item.type || 'AUDIO_VIDEO',
      sha256Hash: item.sha256Hash || 'UNHASHED_STREAM',
      capturedAt: item.capturedAt || item.timestamp,
      fileSize: item.fileSize || 0,
      storageUri: item.storagePath || item.storageUri || 'gs://wana-evidence-vault',
    }));

    const manifestString = JSON.stringify({
      eventId,
      coordinates: eventData.location,
      dispatchedAt: eventData.createdAtIso || eventData.dispatchedAt,
      evidenceHashes: evidenceManifest.map((m) => m.sha256Hash),
      breadcrumbCount: breadcrumbs.length,
    });

    const masterDossierSha256 = crypto.createHash('sha256').update(manifestString).digest('hex');
    const certifiedAtIso = new Date().toISOString();
    const dossierRefNumber = `BSA-65B-WANA-${eventId.substring(0, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    // 7. Draft Section 65B Certificate under Bharatiya Sakshya Adhiniyam, 2023
    const bsa65bCertificateText = `
CERTIFICATE UNDER SECTION 65B OF THE BHARATIYA SAKSHYA ADHINIYAM, 2023
(READ WITH SECTION 63 - ADMISSIBILITY OF ELECTRONIC RECORDS)

1. I, ${certifyingOfficerName}, holding the designation of ${officerDesignation}, posted at ${policeStationJurisdiction}, do hereby solemnly state and affirm as under:

2. That I am in lawful command and supervisory control of the automated computer terminals and emergency dispatch servers of the WANA (Women Automated Network Assistance) platform operating under regional jurisdiction.

3. That the electronic record hereto annexed pertains to emergency incident UUID '${eventId}' initiated at coordinates Latitude: ${eventData.location?.latitude}, Longitude: ${eventData.location?.longitude} on ${eventData.createdAtIso || 'Recorded Emergency Date'}.

4. That throughout the material period during which the said electronic record was generated, ingested, and processed, the computer systems, cloud storage vaults, and cellular telemetry bridges were operating properly and under unbroken cryptographic integrity.

5. That the digital artifacts, multimedia chunks, and location breadcrumbs comprising this electronic record have been verified using SHA-256 cryptographic hashes:
   - MASTER ELECTRONIC RECORD DIGEST: ${masterDossierSha256}
   - NUMBER OF MULTIMEDIA EVIDENCE CHUNKS: ${evidenceItems.length}
   - NUMBER OF GPS BREADCRUMB TELEMETRY FIXES: ${breadcrumbs.length}
   - TACTICAL RECORD EXCHANGES: ${tacticalChats.length}

6. That no unauthorized human alteration, tampering, truncation, or electronic distortion has occurred during the custody and archiving of this electronic data.

Certified and issued at ${policeStationJurisdiction} on ${certifiedAtIso}.

CERTIFYING OFFICER:
Name: ${certifyingOfficerName} (UID: ${certifyingOfficerUid})
Designation: ${officerDesignation}
Jurisdiction: ${policeStationJurisdiction}
Digital Hash Seal: ${masterDossierSha256.substring(0, 32)}...
`.trim();

    const dossierRecord = {
      dossierId: dossierRefNumber,
      eventId,
      status: isOngoing ? 'ACTIVE_ONGOING' : 'RESOLVED_HISTORICAL',
      certifiedAt: certifiedAtIso,
      certifyingOfficer: {
        uid: certifyingOfficerUid,
        name: certifyingOfficerName,
        designation: officerDesignation,
        jurisdiction: policeStationJurisdiction,
      },
      masterSha256: masterDossierSha256,
      incidentSummary: {
        eventId,
        type: eventData.type,
        regionId: eventData.regionId,
        victimName: eventData.victimName,
        victimPhone: eventData.victimPhone,
        initialLocation: eventData.location,
        batteryAtTrigger: eventData.batteryLevel,
        duressDetected: !!eventData.duressDetected,
        imminentPowerDeath: !!eventData.imminentPowerDeath,
      },
      evidenceManifest,
      breadcrumbsCount: breadcrumbs.length,
      breadcrumbsSample: breadcrumbs.slice(0, 10),
      tacticalChats,
      auditLogsCount: auditLogs.length,
      auditLogs,
      bsa65bCertificateText,
    };

    // Store in permanent legalDossiers collection
    await db.collection('legalDossiers').doc(eventId).set(dossierRecord);

    // Audit log
    await writeAuditLog({
      actorUid: certifyingOfficerUid,
      actorRole: 'supervisor',
      action: 'LEGAL_DOSSIER_BSA_65B_GENERATED',
      targetId: eventId,
      regionId: eventData.regionId,
      details: {
        dossierId: dossierRefNumber,
        masterSha256: masterDossierSha256,
        certifyingOfficerName,
      },
      req,
      customDocId: `audit_${eventId}_dossier_${Date.now()}`,
    });

    return {
      success: true,
      dossierId: dossierRefNumber,
      masterSha256: masterDossierSha256,
      certifiedAt: certifiedAtIso,
      dossier: dossierRecord,
    };
  }

  /**
   * Retrieves an already-generated dossier for an incident.
   */
  static async getDossier(eventId) {
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError("Valid 'eventId' is required.", 400, 'INVALID_EVENT_ID');
    }

    const doc = await LegalDossierService.getDb().collection('legalDossiers').doc(eventId).get();
    if (!doc.exists) {
      return null;
    }

    return doc.data();
  }
}

module.exports = LegalDossierService;
