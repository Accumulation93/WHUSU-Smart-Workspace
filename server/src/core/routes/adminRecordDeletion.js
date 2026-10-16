'use strict';

const router = require('express').Router();
const model = require('../models/adminRecordDeletion');
const cleanup = require('../services/adminRecordFileCleanup');
const { actorFromRequest } = require('../services/adminDeletionActor');
const copy = require('../../locales/zh-CN/adminGovernance');

function register(route, type, remove) {
  router.post(route, async (req, res) => {
    const actor = actorFromRequest(req);
    const id = req.body && req.body.id;
    if (!actor) return res.status(403).json({ status: 'forbidden', message: copy.forbidden });
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return res.status(400).json({ status: 'invalid_params', message: copy.invalid });
    try {
      if (!remove) return res.json({ status: 'success', record: await model.preview(actor, type, id) });
      const result = await model.remove(actor, type, id, req.body.revision);
      let cleanupPending = false;
      try { cleanupPending = (await cleanup.processPending(result.deletionId)).pending > 0; }
      catch (_) { cleanupPending = true; }
      return res.json({ status: 'success', deleted: true, cleanupPending, message: cleanupPending ? copy.cleanupPending : copy.deleted });
    } catch (error) {
      const messages = { forbidden: copy.forbidden, not_found: copy.notFound, record_changed: copy.changed, invalid_params: copy.invalid };
      const code = messages[error.code] ? error.code : 'error';
      if (code === 'error') req.logger.error('Admin record deletion failed', { type, error: error.message });
      return res.status(code === 'forbidden' ? 403 : code === 'error' ? 500 : code === 'invalid_params' ? 400 : code === 'not_found' ? 404 : 409).json({ status: code, message: messages[code] || copy.failed });
    }
  });
}

register('/previewAuditSubmissionDeletion', 'audit', false);
register('/deleteAuditSubmission', 'audit', true);
register('/previewVenueBookingDeletion', 'booking', false);
register('/deleteVenueBooking', 'booking', true);
module.exports = router;
