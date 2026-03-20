#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

console.log('===== APPLICATION STARTED =====');

const WORDS_PER_SEC = 2.8;
const FPS = 24;
const INTRO_DUR = 1.0;
const OUTRO_DUR = 1.0;
const PAUSE_DUR = 0.4;

function parseScript(scriptPath) {
  console.log('parseScript');
  const content = fs.readFileSync(scriptPath, 'utf-8');
  const lines = content.split('\n');
  const segments = [];

  const expressionRegex = /^\[([A-Z_]+)\]\s*(.*)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const match = trimmed.match(expressionRegex);
    if (!match) continue;

    const [, expression, text] = match;
    const words = text.split(/\s+/).filter(Boolean);

    if (words.length === 0) continue;

    const duration = Math.max(1.5, words.length / WORDS_PER_SEC);
    const totalFrames = Math.round(duration * FPS);

    segments.push({
      expression,
      text,
      words,
      duration,
      totalFrames,
    });
  }

  return segments;
}

function buildMouthTrack(segment) {
  const { words, totalFrames } = segment;
  const track = new Array(totalFrames).fill(0);

  const framesPerWord = totalFrames / words.length;

  for (let wi = 0; wi < words.length; wi++) {
    const word = words[wi];
    const startFrame = Math.round(wi * framesPerWord);
    const endFrame = Math.round((wi + 1) * framesPerWord);

    const vowelCount = (word.match(/[aeiouAEIOU]/g) || []).length;
    const openness = Math.min(1.0, 0.3 + vowelCount * 0.18);
    const syllables = Math.ceil(word.length / 3);

    for (let f = startFrame; f < endFrame; f++) {
      const phase = (f - startFrame) / (endFrame - startFrame);
      const syllPhase = (phase * syllables) % 1;

      const pulse = Math.sin(syllPhase * Math.PI);
      const envelope = Math.sin(phase * Math.PI);

      track[f] = openness * pulse * envelope;
    }
  }

  return track;
}

function buildFrameManifest(segments) {
  console.log('buildFrameManifest');
  const frames = [];
  let frameCounter = 0;

  // Intro
  const introFrames = Math.round(INTRO_DUR * FPS);
  for (let i = 0; i < introFrames; i++) {
    frames.push({
      frame: frameCounter++,
      expression: 'IDLE',
      mouth: 0,
      text: '',
      subVisible: false,
      wordIndex: -1,
      words: [],
    });
  }

  // Process each segment
  for (const segment of segments) {
    const mouthTrack = buildMouthTrack(segment);

    for (let f = 0; f < segment.totalFrames; f++) {
      const wordIndex = Math.floor((f / segment.totalFrames) * segment.words.length);
      frames.push({
        frame: frameCounter++,
        expression: segment.expression,
        mouth: mouthTrack[f],
        text: segment.text,
        subVisible: true,
        wordIndex,
        words: segment.words,
      });
    }

    // Pause after segment
    const pauseFrames = Math.round(PAUSE_DUR * FPS);
    for (let i = 0; i < pauseFrames; i++) {
      frames.push({
        frame: frameCounter++,
        expression: 'IDLE',
        mouth: 0,
        text: '',
        subVisible: false,
        wordIndex: -1,
        words: [],
      });
    }
  }

  // Outro
  const outroFrames = Math.round(OUTRO_DUR * FPS);
  for (let i = 0; i < outroFrames; i++) {
    frames.push({
      frame: frameCounter++,
      expression: 'WAVING',
      mouth: 0,
      text: '',
      subVisible: false,
      wordIndex: -1,
      words: [],
    });
  }

  return frames;
}

async function main() {
  const args = process.argv.slice(2);
  console.log('Arguments:', args);

  if (args.length < 2) {
    console.log('Usage: node app.js <script.txt> <output.mp4>');
    process.exit(1);
  }

  const scriptPath = args[0];
  const outputPath = args[1];
  const workDir = path.dirname(outputPath) || '.';

  console.log('Input:', scriptPath);
  console.log('Output:', outputPath);
  console.log('WorkDir:', workDir);

  try {
    // Step 1
    console.log('[1] Parsing script');
    if (!fs.existsSync(scriptPath)) {
      throw new Error('Script not found');
    }
    const segments = parseScript(scriptPath);
    console.log('[1] OK - segments:', segments.length);

    // Step 2
    console.log('[2] Building manifest');
    const frames = buildFrameManifest(segments);
    console.log('[2] OK - frames:', frames.length);

    // Step 3
    console.log('[3] Writing manifest');
    const manifestPath = path.join(workDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ fps: FPS, totalFrames: frames.length, frames }, null, 2));
    console.log('[3] OK - written:', manifestPath);

    console.log('\n===== SUCCESS =====');
    process.exit(0);
  } catch (error) {
    console.error('\n===== ERROR =====');
    console.error(error.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
