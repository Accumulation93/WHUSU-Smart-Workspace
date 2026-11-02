'use strict';
const router = require('express').Router();
const model = require('../models/contactDirectory');
const { DirectoryError } = require('../services/contactDirectoryPolicy');
const { getAuthenticatedContext } = require('../services/authenticatedContext');
const { requireAdminOrganizationPermission, AdminOrganizationAccessError } = require('../services/adminOrganizationAccess');
const copy = require('../../locales/zh-CN/contactDirectory');
const { authorizeDirectory, authorizeEntries } = require('../services/contactDirectoryAuthorization');

function handler(work) {
  return async (req, res) => {
    try {
      const actor = getAuthenticatedContext(req);
      if (!actor) return res.status(401).json({ status: 'unauthorized', message: copy.forbidden });
      const data = await work(req.body || {}, actor, req);
      res.json(Object.assign({ status: 'success' }, data));
    } catch (error) {
      if (error instanceof DirectoryError) return res.json({ status: 'directory_' + error.code, message: copy[error.code] || copy.operationFailed });
      if (error instanceof AdminOrganizationAccessError) return res.status(403).json({ status: 'forbidden', message: copy.forbidden });
      if (error.code === 'authorization_forbidden') return res.status(403).json({ status: 'forbidden', message: copy.forbidden });
      console.error('[contact-directory]', error.code || error.name);
      res.status(500).json({ status: 'error', message: copy.operationFailed });
    }
  };
}
router.post('/getContactDirectory', handler((body, actor, req) => model.read(actor, Object.assign({ summaryOnly: body.summaryOnly === true,
  authorizeEntries: authorizeEntries(req, actor) }, body.key === undefined ? {} : { key: body.key }))));
router.post('/resolvePersonLinks', handler(async (body, actor, req) => {
  try {
    return await model.resolveLinks(actor, body.references,
      connection => requireAdminOrganizationPermission(req, actor.organizationId, ['hr.people', 'hr.profile_review'], connection), authorizeEntries(req, actor));
  } catch (error) {
    if (error instanceof AdminOrganizationAccessError) return { links: [] };
    throw error;
  }
}));
function authorize(req, actor) {
  return authorizeDirectory(req, actor);
}
router.post('/getContactDirectoryConfiguration', handler((body, actor, req) => model.configuration(actor.organizationId, authorize(req, actor))));
router.post('/saveContactDirectoryRule', handler(async (body, actor, req) => ({ rule: await model.save(body, actor.organizationId, authorize(req, actor)) })));
router.post('/batchContactDirectoryRules', handler((body, actor, req) => model.batch(body, actor.organizationId, authorize(req, actor))));
module.exports = router;
