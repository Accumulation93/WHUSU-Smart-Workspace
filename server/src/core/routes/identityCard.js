'use strict';
const router = require('express').Router();
const model = require('../models/identityCard');
const codes = require('../services/identityCardCode');
const { getAuthenticatedContext } = require('../services/authenticatedContext');
const copy = require('../../locales/zh-CN/identityCard');
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
router.post('/getMyIdentityCard', handle((req, actor) => model.mine(req.authAccount.id, actor)));
router.post('/createMyIdentityCardCode', handle((req, actor) => model.issue(req.authAccount.id, actor, token => codes.createImage(token, (req.body || {}).envVersion || 'release'))));
router.post('/verifyIdentityCard', handle(req => model.verify((req.body || {}).token), true));
module.exports = router;
