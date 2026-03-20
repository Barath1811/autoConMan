#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Write directly  
process.stdout.write('STARTUP\n');
process.stderr.write('ERROR_STREAM_TEST\n');

const scriptPath = process.argv[2];
const outputPath = process.argv[3];

process.stdout.write('Args: ' + scriptPath + ', ' + outputPath + '\n');

if (!fs.existsSync(scriptPath)) {
  process.stdout.write('ERROR: Script not found: ' + scriptPath + '\n');
  process.exit(1);
}

// Parse script synchronously
process.stdout.write('Parsing script...\n');
const content = fs.readFileSync(scriptPath, 'utf-8');
const lines = content.split('\n');
process.stdout.write('Read ' + lines.length + ' lines\n');

process.stdout.write('Done\n');
