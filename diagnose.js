#!/usr/bin/env node
const fs = require('fs');

// Write immediately to file
fs.writeFileSync('test_direct.log', 'Started\n');

try {
  const config = require('./src/config/config');
  fs.appendFileSync('test_direct.log', 'Config loaded\n');
} catch (e) {
  fs.appendFileSync('test_direct.log', 'Config error: ' + e.message + '\n');
}

try {
  const index = require('./index.js');
  fs.appendFileSync('test_direct.log', 'Index loaded\n');
} catch (e) {
  fs.appendFileSync('test_direct.log', 'Index error: ' + e.message + '\n');
}

fs.appendFileSync('test_direct.log', 'Done\n');
