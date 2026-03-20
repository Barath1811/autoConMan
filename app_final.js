#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

// FORCE synchronous file output
const logFile = 'app_execution.log';
const lines = [];

try {
  lines.push('=== APP STARTED ===');
  lines.push('Time: ' + new Date().toISOString());
  lines.push('Args: ' + JSON.stringify(args));
  lines.push('CWD: ' + process.cwd());
  
  if (args.length < 2) {
    lines.push('ERROR: Need <script> <output_dir>');
    throw new Error('Missing arguments');
  }
  
  lines.push('Script: ' + args[0]);
  lines.push('Output: ' + args[1]);
  
  // Check files exist
  lines.push('Script exists: ' + fs.existsSync(args[0]));
  lines.push('Output dir exists: ' + fs.existsSync(args[1]));
  
  if (!fs.existsSync(args[0])) {
    throw new Error('Script not found');
  }
  
  // READ script
  const content = fs.readFileSync(args[0], 'utf-8');
  lines.push('Script length: ' + content.length);

  // PARSE script  
  const segments = [];
  const regex = /^\[([A-Z_]+)\]\s*(.*)/;
  for (const line of content.split('\n')) {
    const match = line.trim().match(regex);
    if (match) {
      segments.push({
        expr: match[1],
        text: match[2]
      });
    }
  }
  lines.push('Segments: ' + segments.length);

  // WRITE manifest
  const manifest = {
    fps: 24,
    segments: segments
  };
  const manifestPath = path.join(args[1], 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  lines.push('Manifest written: ' + manifestPath);
  lines.push('File exists: ' + fs.existsSync(manifestPath));
  
  lines.push('=== SUCCESS ===');
} catch (e) {
  lines.push('ERROR: ' + e.message);
  lines.push(e.stack);
}

// Write log
fs.writeFileSync(logFile, lines.join('\n'));
console.log('Wrote log to ' + logFile);
