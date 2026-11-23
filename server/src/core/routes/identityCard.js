'use strict';
const router = require('express').Router();
const model = require('../models/identityCard');
const policy = require('../models/identityCardPolicy');
const codes = require('../services/identityCardCode');
const { getAuthenticatedContext } = require('../services/authenticatedContext');
const { referenceFromRequest } = require('../services/authorizationReference');
const copy = require('../../locales/zh-CN/identityCard');
const authorizationCopy = require('../../locales/zh-CN/authorization');
function handle(work, publicRead = false) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const actor = getAuthenticatedContext(req);
      if (!publicRead && !actor) return res.status(401).json({ status: 'unauthorized', message: copy.login });
      const data = await work(req, actor);
      res.json(Object.assign({ status: 'success' }, data));
    } catch (_) {
      res.status(503).json({ status: 'identity_card_unavailable', message: copy.failure });
    }
  };
}

function handlePolicy(work) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const reference = referenceFromRequest(req);
      if (!reference) return res.status(401).json({ status: 'unauthorized', message: authorizationCopy.loginRequired });
      const data = await work(reference, req.body || {});
      return res.json({ status: 'success', ...data });
    } catch (error) {
      if (error.code === 'authorization_forbidden') return res.status(403).json({ status: error.code, message: authorizationCopy.forbidden });
      if (error.code === 'authorization_conflict') return res.status(409).json({ status: error.code, message: authorizationCopy.conflict });
      if (error.code === 'invalid_params') return res.status(400).json({ status: error.code, message: authorizationCopy.invalidPolicy });
      if (req.logger) req.logger.error('Identity card policy operation failed', { code: error.code || 'unexpected_error' });
      return res.status(500).json({ status: 'error', message: authorizationCopy.operationFailed });
    }
  };
}

router.post('/getIdentityCardPolicy', handlePolicy(policy.get));
router.post('/saveIdentityCardPolicy', handlePolicy(policy.save));
router.post('/getMyIdentityCard', handle((req, actor) => model.mine(req.authAccount.id, actor, referenceFromRequest(req))));
router.post('/createMyIdentityCardCode', handle((req, actor) => model.issue(req.authAccount.id, actor, async token => {
  const [image, verificationImage] = await Promise.all([
    codes.createImage(token, (req.body || {}).envVersion || 'release'), codes.createVerificationImage(token)
  ]);
  return { image, verificationImage };
}, referenceFromRequest(req))));
router.post('/verifyIdentityCard', handle(req => model.verify((req.body || {}).token), true));
module.exports = router;
