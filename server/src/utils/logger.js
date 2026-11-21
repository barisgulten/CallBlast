'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const config = require('../config');

/**
 * Application-wide Winston logger.
 * Writes to both the console and a rotating log file.
 */
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
      if (stack) {
        log += `\n${stack}`;
      }
      if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
      }
      return log;
    })
  ),
  transports: [
    // Console transport – always active
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message, stack }) => {
          let log = `${timestamp} ${level} ${message}`;
          if (stack) log += `\n${stack}`;
          return log;
        })
      ),
    }),

    // File transport – persistent logs
    new transports.File({
      filename: path.join(config.paths.data, 'callblast.log'),
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

module.exports = logger;
