'use strict';

const authorization = require('../models/participationAuthorization');
const { referenceFromRequest } = require('../../../core/services/authorizationReference');
const { safeString } = require('../../../utils/helpers');
const copy = require('../../../locales/zh-CN/generated/modules/scoring/routes/results');

function authorizedParticipationRead(kind, handler) {
  return async (req, res) => {
    const reference = referenceFromRequest(req);
    if (!reference) return handler(req, res);
    try {
      const pool = require('../../../config/db');
      let payload;
      const response = { json(value) { payload = value; return value; } };
      await handler(req, response);
      if (!payload || payload.status !== 'success') return res.json(payload);
      const organizationId = reference.organizationId;
      if (kind === 'targets') {
        payload.targets = await authorization.filterTargets(req, organizationId, payload.targets || []);
      } else if (kind === 'form') {
        await pool.withTransaction(connection => authorization.checkTarget(req, connection, organizationId, payload.target, 'read'));
      } else {
        const publication = await require('../models/resultPublication').getByActivity(safeString(req.body.activityId));
        if (!publication) return res.status(403).json({ status: 'forbidden', message: copy.copy_f048be09ae });
        await pool.withTransaction(connection => authorization.checkPublication(req, connection, organizationId,
          publication.id, kind, 'read'));
        if (kind === 'scoring.meritSelections' && payload.canDesignate) {
          try {
            await pool.withTransaction(connection => authorization.checkPublication(req, connection, organizationId, publication.id, kind, 'update'));
          } catch (error) {
            if (error.code !== 'authorization_forbidden') throw error;
            payload.canDesignate = false;
            payload.designationCandidates = [];
          }
        }
      }
      return res.json(payload);
    } catch (error) {
      if (error.code === 'authorization_forbidden') return res.status(403).json({ status: 'forbidden', message: copy.copy_f048be09ae });
      req.logger?.error('Authorized scoring participation read failed', { error: error.code || error.message });
      return res.status(500).json({ status: 'error', message: copy.copy_f048be09ae });
    }
  };
}

module.exports = { authorizedParticipationRead };
