'use strict';

class Logger {
  static info(msg) {
    console.log(`[${new Date().toISOString()}] [INFO] ${msg}`);
  }

  static warn(msg) {
    console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`);
  }

  static error(msg, err = null) {
    console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`);
    if (err && err.stack) {
      console.error(err.stack);
    }
  }

  static debug(msg) {
    if (process.env.DEBUG) {
      console.log(`[${new Date().toISOString()}] [DEBUG] ${msg}`);
    }
  }
}

module.exports = Logger;
