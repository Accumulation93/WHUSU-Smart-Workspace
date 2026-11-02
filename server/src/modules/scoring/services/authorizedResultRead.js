'use strict';

const copy = require('../../../locales/zh-CN/generated/modules/scoring/routes/results');
const { safeString } = require('../../../utils/helpers');

// 暂存一次 JSON 响应，在发送前重新核对会话和授权版本；旧权限路径保持原调用方式。
function authorizedResultRead(action, handler) {
  return async function read(req, res) {
    const reference = req.unifiedAuthorization?.reference;
    if (!reference || !req.body?.activityId) return handler(req, res);
    try {
      req.scoringAccess = await require('../models/resultAuthorization').read(reference, safeString(req.body.activityId), action);
      let payload, status = 200;
      const response = {
        json(value) { if (payload !== undefined) throw Object.assign(new Error(copy.copy_f048be09ae), { code: 'duplicate_scoring_response' }); payload = value; return value; },
        status(value) { status = value; return response; }
      };
      await handler(req, response);
      if (payload === undefined) throw Object.assign(new Error(copy.copy_f048be09ae), { code: 'missing_scoring_response' });
      await req.scoringAccess.confirm();
      return res.status(status).json(payload);
    } catch (error) {
      if (error.code === 'authorization_forbidden') return res.status(403).json({ status: 'forbidden', message: copy.copy_f048be09ae });
      req.logger?.error('Authorized scoring read failed', { error: error.code || error.message });
      return res.status(500).json({ status: 'error', message: copy.copy_f048be09ae });
    }
  };
}

module.exports = { authorizedResultRead };
