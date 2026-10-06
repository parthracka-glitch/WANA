const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const LegalDossierService = require('../services/legalDossierService');

/**
 * POST /dossier/:eventId/generate (BE-26 / FE-22)
 * Compiles a court-ready electronic evidence dossier and Bharatiya Sakshya Adhiniyam 2023 Sec 65B Certificate.
 */
router.post('/:eventId/generate', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { officerDesignation, policeStationJurisdiction } = req.body;
    const certifyingOfficerUid = req.user.uid;
    const certifyingOfficerName = req.user.name || req.user.email || 'Duty Police Supervisor';

    const result = await LegalDossierService.generateDossier({
      eventId,
      certifyingOfficerUid,
      certifyingOfficerName,
      officerDesignation: officerDesignation || 'Station Duty Officer / Supervisor',
      policeStationJurisdiction: policeStationJurisdiction || 'Solapur Central Police Station',
      req,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /dossier/:eventId (BE-26 / FE-22)
 * Retrieve an existing legal dossier.
 */
router.get('/:eventId', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const dossier = await LegalDossierService.getDossier(eventId);

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: `No legal dossier generated yet for event '${eventId}'. Please generate one.`,
      });
    }

    return res.json({
      success: true,
      data: dossier,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
