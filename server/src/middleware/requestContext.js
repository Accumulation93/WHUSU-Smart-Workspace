const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');

function requestContext(req, res, next) {
  const providedRequestId = String(req.get('X-Request-Id') || '').trim();
  req.requestId = /^[A-Za-z0-9._:-]{8,128}$/.test(providedRequestId) ? providedRequestId : randomUUID();
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', req.requestId);

  req.logger = {
    info: (msg, meta) => logger.info(msg, { requestId: req.requestId, ...meta }),
    warn: (msg, meta) => logger.warn(msg, { requestId: req.requestId, ...meta }),
    error: (msg, meta) => logger.error(msg, { requestId: req.requestId, ...meta })
  };

  next();
}

module.exports = requestContext;
