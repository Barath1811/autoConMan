'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { config, validateConfig } = require('./src/config/config');
const AuthService = require('./src/services/authService');
const DriveService = require('./src/services/driveService');
const DBService = require('./src/services/dbService');
const DocService = require('./src/services/docService');
const AIService = require('./src/services/aiService');
const YouTubeService = require('./src/services/youtubeService');

// ─── Constants ────────────────────────────────────────────────────────────────
// ─── Constants ────────────────────────────────────────────────────────────────
const {
  WORDS_PER_SEC,
  FPS,
  INTRO_DUR,
  OUTRO_DUR,
  PAUSE_DUR,
} = {
  WORDS_PER_SEC: config.wordsPerSec,
  FPS: config.fps,
  INTRO_DUR: config.introDur,
  OUTRO_DUR: config.outroDur,
  PAUSE_DUR: config.pauseDur,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

function getPythonCmd() {
  if (process.platform === 'win32') {
    const venvPython = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
    return fs.existsSync(venvPython) ? venvPython : 'python';
  }
  return 'python3';
}

// ─── Stage 1: Parse script file ───────────────────────────────────────────────
function parseScript(scriptPath) {
  const content = fs.readFileSync(scriptPath, 'utf-8');
  const segments = [];
  const expressionRegex = /^\[([A-Z_]+)\]\s*(.*)/;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const match = trimmed.match(expressionRegex);
    if (!match) continue;

    const [, expression, text] = match;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    segments.push({
      expression,
      text,
      words,
      duration: Math.max(1.5, words.length / WORDS_PER_SEC),
      totalFrames: Math.round(Math.max(1.5, words.length / WORDS_PER_SEC) * FPS),
    });
  }
  return segments;
}

// ─── Stage 2: Build lip sync track ────────────────────────────────────────────
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
      track[f] = openness * Math.sin(syllPhase * Math.PI) * Math.sin(phase * Math.PI);
    }
  }
  return track;
}

// ─── Stage 3: Build frame manifest ────────────────────────────────────────────
function buildFrameManifest(segments) {
  const frames = [];
  let fc = 0;

  const silence = (expr = 'IDLE', dur = INTRO_DUR) => {
    for (let i = 0; i < Math.round(dur * FPS); i++) {
      frames.push({ frame: fc++, expression: expr, mouth: 0, text: '', subVisible: false, wordIndex: -1, words: [] });
    }
  };

  silence('IDLE', INTRO_DUR);

  for (const seg of segments) {
    const mouthTrack = buildMouthTrack(seg);
    for (let f = 0; f < seg.totalFrames; f++) {
      frames.push({
        frame: fc++,
        expression: seg.expression,
        mouth: mouthTrack[f],
        text: seg.text,
        subVisible: true,
        wordIndex: Math.floor((f / seg.totalFrames) * seg.words.length),
        words: seg.words,
      });
    }
    silence('IDLE', PAUSE_DUR);
  }

  silence('WAVING', OUTRO_DUR);
  return frames;
}

// ─── Stage 4: Write manifest ───────────────────────────────────────────────────
function writeManifest(frames, manifestPath) {
  fs.writeFileSync(manifestPath, JSON.stringify({ fps: FPS, totalFrames: frames.length, frames }, null, 2));
  log(`✓ Manifest: ${frames.length} frames`);
}

// ─── Stage 5: Render frames ────────────────────────────────────────────────────
function renderFrames(manifestPath, framesDir) {
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
  log('Rendering frames...');

  const result = spawnSync(getPythonCmd(), [path.join(__dirname, 'renderer.py'), manifestPath, framesDir], {
    stdio: 'inherit',
    timeout: 300_000,
  });

  if (result.error) throw new Error(`Renderer spawn failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Renderer exited with code ${result.status}`);
  log('✓ Frames rendered');
}

// ─── Stage 6: Encode video ─────────────────────────────────────────────────────
function encodeVideo(manifestPath, framesDir, outputPath) {
  log('Encoding video...');

  const result = spawnSync(getPythonCmd(), [
    path.join(__dirname, 'video_encoder.py'),
    manifestPath,
    outputPath,
    String(FPS),
    framesDir,
  ], {
    stdio: 'inherit',
    timeout: 600_000,
  });

  if (result.error) throw new Error(`Encoder spawn failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Encoder exited with code ${result.status}`);
  log(`✓ Video encoded: ${outputPath}`);
}

// ─── Pipeline: Script → Video ──────────────────────────────────────────────────
async function generateVideo(scriptPath, outputPath) {
  const runId = `autoconman_${Date.now()}_${process.pid}`;
  const tempDir = path.join(os.tmpdir(), runId);
  const manifestPath = path.join(tempDir, 'manifest.json');
  const framesDir = path.join(tempDir, 'frames');

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    log(`Temp workspace: ${tempDir}`);

    const segments = parseScript(scriptPath);
    if (segments.length === 0) throw new Error('No valid segments found in script.');
    log(`Parsed ${segments.length} segment(s)`);

    const frames = buildFrameManifest(segments);
    writeManifest(frames, manifestPath);
    renderFrames(manifestPath, framesDir);
    encodeVideo(manifestPath, framesDir, outputPath);

    log(`✓ Video ready: ${outputPath}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    log('Temp workspace cleaned up.');
  }
}

// ─── Main: Drive → AI → Video → YouTube ───────────────────────────────────────
async function main() {
  validateConfig();

  // Initialize Services
  const authService = new AuthService(config);
  const auth = authService.getAuth();

  const driveService = new DriveService(auth);
  const docService = new DocService(auth);
  const aiService = new AIService(config);
  const youtubeService = new YouTubeService(config);

  const dbService = new DBService(config.dbConnectionString, config.dbName);

  try {
    // 1. Fetch files from Drive
    log('[1/4] Fetching files from Google Drive...');
    const allFiles = await driveService.listFilesInFolder(config.driveFolderId);
    log(`Found ${allFiles.length} file(s) in Drive`);

    // 2. Detect new/modified files via DB
    log('[2/4] Checking for new or modified files...');
    await dbService.connect();
    const newFiles = await dbService.getModifiedFiles(allFiles);
    if (newFiles.length === 0) {
      log('No new or modified files. Nothing to do.');
      return;
    }
    log(`${newFiles.length} file(s) to process`);

    // 3. Process each file
    const outputDir = path.join(__dirname, 'output');
    fs.mkdirSync(outputDir, { recursive: true });

    const processedFiles = [];
    for (const file of newFiles) {
      if (file.mimeType !== 'application/vnd.google-apps.document') continue;

      log(`\n[3/4] Processing: ${file.name}`);
      try {
        // Read document content
        const contentArray = await docService.getDocumentContentAsArray(file.id);
        if (!docService.isDocumentReady(contentArray)) {
          log(`  SKIP: ${file.name} — missing [READY] tag`);
          continue;
        }

        // Strip [READY] marker, send remaining content to AI
        const payload = contentArray.filter(p => !p.toUpperCase().includes('[READY]'));
        log(`  → Rewriting content with AI...`);
        const script = await aiService.generateScript(payload);

        // Write script to temp, generate video, delete script
        const scriptPath = path.join(os.tmpdir(), `acm_script_${Date.now()}.txt`);
        fs.writeFileSync(scriptPath, script);

        const videoPath = path.join(outputDir, `${file.name.replace(/\s+/g, '_')}_output.mp4`);
        await generateVideo(scriptPath, videoPath);
        fs.unlinkSync(scriptPath);

        // Upload to YouTube
        log(`[4/4] Uploading to YouTube...`);
        await youtubeService.uploadVideo(videoPath, {
          title: file.name,
          description: `Auto-generated commentary.\n\nSource: ${file.name}`,
          tags: ['AI', 'Automation', 'Commentary'],
        });

        processedFiles.push(file);
      } catch (err) {
        log(`  ✗ Failed: ${err.message}`);
        console.error(err.stack);
      }
    }

    // 4. Mark files as processed in DB
    if (processedFiles.length > 0) {
      await dbService.upsertFiles(processedFiles);
      log(`✓ Database updated for ${processedFiles.length} file(s)`);
    }

  } finally {
    await dbService.disconnect();
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
if (require.main === module) {
  console.log('[autoConMan] Starting pipeline...');
  main()
    .then(() => {
      console.log('[autoConMan] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[autoConMan] Fatal error:', err.message);
      console.error(err.stack);
      process.exit(1);
    });
}
