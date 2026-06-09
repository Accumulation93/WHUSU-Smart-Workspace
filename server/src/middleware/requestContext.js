const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

function requestContext(req, res, next) {
  req.requestId = uuidv4();
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
