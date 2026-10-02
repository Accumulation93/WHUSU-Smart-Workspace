const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');
const requestWork = require('../utils/requestWork');

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

  requestWork.run(() => {
    const state = requestWork.getState();
    state.readOnly = /^\/api\/(getMessageOverview|listTodos|getTodoCount|listNotifications|getNotificationUnreadCount)$/.test(req.path);
    let previous = performance.now();
    req.performanceMark = function(name) {
      const now = performance.now();
      state.stages[name] = now - previous;
      previous = now;
    };
    const sendJson = res.json.bind(res);
    res.json = function(value) {
      req.performanceMark('handlerUntilResponse');
      const started = performance.now();
      try { return sendJson(value); } finally { state.stages.responseSerialization = performance.now() - started; }
    };
    res.once('finish', () => {
      const elapsedMs = Date.now() - req.startTime;
      if (elapsedMs < 500 && !/\/(getMessageOverview|listTodos|listNotifications)$/.test(req.path)) return;
      req.logger.info('Request performance', {
        event: 'request.performance', path: req.path, elapsedMs,
        sqlCount: state.sqlCount, sqlMs: Math.round(state.sqlMs),
        poolWaitMs: Math.round(state.poolWaitMs), rows: state.rows,
        requestBytes: Number(req.get('content-length') || 0),
        responseBytes: Number(res.getHeader('content-length') || 0),
        stages: Object.fromEntries(Object.entries(state.stages).map(([key, value]) => [key, Math.round(value)]))
      });
    });
    next();
  });
}

module.exports = requestContext;
