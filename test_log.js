const fs = require('fs');

function log(msg) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}\n`;
  process.stdout.write(logMsg);
  fs.appendFileSync('log_test.log', logMsg);
}

log('Test log message 1');
log('Test log message 2');
console.log('Done!');
