#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

process.stdout.write('START\n');

const args = process.argv.slice(2);
process.stdout.write('Args count: ' + args.length + '\n');
process.stdout.write('Args: [' + args.join(', ') + ']\n');

if (args.length < 2) {
  process.stdout.write('ERROR: Need 2 args\n');
  process.exit(1);
}

const scriptPath = args[0];
const outputPath = args[1];

process.stdout.write('Script: ' + scriptPath + '\n');
process.stdout.write('Output: ' + outputPath + '\n');

try {
  if (!fs.existsSync(scriptPath)) {
    throw new Error('Not found: ' + scriptPath);
  }

  const content = fs.readFileSync(scriptPath, 'utf-8');
  process.stdout.write('Read: ' + content.length + ' bytes\n');

  const workDir = path.dirname(outputPath) || '.';
  const manifestPath = path.join(workDir, 'manifest.json');
  
  const obj = { test: true, frames: [] };
  fs.writeFileSync(manifestPath, JSON.stringify(obj));
  
  process.stdout.write('Created: ' + manifestPath + '\n');
  process.stdout.write('END\n');
  process.exit(0);
} catch (e) {
  process.stdout.write('EXCEPTION: ' + e.message + '\n');
  process.exit(1);
}
