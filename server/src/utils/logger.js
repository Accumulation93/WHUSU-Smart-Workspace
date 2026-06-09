const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const logsDir = path.join(__dirname, '..', '..', 'logs');

const { format } = winston;

const jsonFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  format.errors({ stack: true }),
  format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  transports: [
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '200m',
      maxFiles: '30d',
      level: 'info'
    }),
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '200m',
      maxFiles: '30d',
      level: 'error'
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: format.combine(
      format.colorize(),
      format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
      format.printf(({ timestamp, level, message, requestId, userId, ...meta }) => {
        const ctx = [requestId && `[${requestId}]`, userId && `[${userId}]`].filter(Boolean).join(' ');
        const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} ${level} ${ctx} ${message}${metaStr}`;
      })
    )
  }));
}

/**
 * Create a morgan-compatible write stream that logs HTTP requests at info level.
 */
function createRequestLogger() {
  return {
    write: (message) => {
      const trimmed = message.trim();
      if (trimmed) {
        logger.info(trimmed, { type: 'http' });
      }
    }
  };
}

module.exports = { logger, createRequestLogger };
