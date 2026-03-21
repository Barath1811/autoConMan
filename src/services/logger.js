'use strict';

/**
 * Centralized logging utility for the application.
 */
class Logger {
  /**
   * Logs an informational message.
   * @param {string} msg 
   */
  static info(msg) {
    console.log(`[${new Date().toISOString()}] [INFO] ${msg}`);
  }

  /**
   * Logs a warning message.
   * @param {string} msg 
   */
  static warn(msg) {
    console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`);
  }

  /**
   * Logs an error message and optional error stack.
   * @param {string} msg 
   * @param {Error} [err]
   */
  static error(msg, err = null) {
    console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`);
    if (err && err.stack) {
      console.error(err.stack);
    }
  }

  /**
   * Logs a debug message if the DEBUG environment variable is set.
   * @param {string} msg 
   */
  static debug(msg) {
    if (process.env.DEBUG) {
      console.log(`[${new Date().toISOString()}] [DEBUG] ${msg}`);
    }
  }
}

module.exports = Logger;
