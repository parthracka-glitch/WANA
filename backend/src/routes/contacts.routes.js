const express = require('express');
const router = express.Router();
const ContactService = require('../services/contactService');
const { authMiddleware } = require('../middleware/authMiddleware');

/**
 * Emergency Contacts API (M-09)
 * Protected: requires valid Firebase user authentication.
 */
router.use(authMiddleware);

// GET /contacts
router.get('/', async (req, res, next) => {
  try {
    const contacts = await ContactService.getUserContacts(req.user.uid);
    res.status(200).json({ success: true, count: contacts.length, data: contacts });
  } catch (error) {
    next(error);
  }
});

// POST /contacts
router.post('/', async (req, res, next) => {
  try {
    const { name, phone, relationship, deviceId, consentGiven } = req.body;
    const newContact = await ContactService.addContact({
      userId: req.user.uid,
      name,
      phone,
      relationship,
      deviceId,
      consentGiven: consentGiven !== false,
      req,
    });
    res.status(201).json({ success: true, data: newContact });
  } catch (error) {
    next(error);
  }
});

// DELETE /contacts/:contactId
router.delete('/:contactId', async (req, res, next) => {
  try {
    const result = await ContactService.deleteContact(req.user.uid, req.params.contactId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
