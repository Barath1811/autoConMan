#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const WORDS_PER_SEC = 2.8;
const FPS = 24;

function parseScript(scriptPath) {
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
  const frames = [];
  let frameCounter = 0;
  const INTRO_DUR = 1.0;
  const OUTRO_DUR = 1.0;
  const PAUSE_DUR = 0.4;

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

// Main
const scriptPath = process.argv[2] || 'test_script.txt';
const outputDir = process.argv[3] || '.';
const manifestPath = path.join(outputDir, 'manifest.json');

try {
  console.log('Parsing: ' + scriptPath);
  const segments = parseScript(scriptPath);
  console.log('Segments: ' + segments.length);

  console.log('Building manifest...');
  const frames = buildFrameManifest(segments);
  console.log('Frames: ' + frames.length);

  console.log('Writing: ' + manifestPath);
  fs.writeFileSync(manifestPath, JSON.stringify({ fps: FPS, totalFrames: frames.length, frames }, null, 2));

  console.log('SUCCESS');
  process.exit(0);
} catch (e) {
  console.error('ERROR: ' + e.message);
  process.exit(1);
}
