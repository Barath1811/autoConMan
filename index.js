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
const TrendService = require('./src/services/trendService');

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
  const trendService = new TrendService();

  const dbService = new DBService(config.dbConnectionString, config.dbName);

  try {
    await dbService.connect();

    // ─── 1. Check Google Drive ───
    // ─── 1. Select Content Source (Drive Priority) ───
    log('[1/4] Scanning for new content...');
    const allFiles = await driveService.listFilesInFolder(config.driveFolderId);
    const newFiles = await dbService.getModifiedFiles(allFiles);
    
    let target = null;
    let payload = null;
    let sourceType = null;

    // Check Drive for [READY] files
    for (const file of newFiles) {
      if (file.mimeType !== 'application/vnd.google-apps.document') continue;
      
      const content = await docService.getDocumentContentAsArray(file.id);
      if (docService.isDocumentReady(content)) {
        log(`  → Selected [READY] Drive file: "${file.name}"`);
        target = file;
        payload = content.filter(p => !p.toUpperCase().includes('[READY]'));
        sourceType = 'DOC';
        break;
      }
    }

    // Fallback to Google Trends
    if (!target) {
      log('  → No ready files in Drive. Checking Google Trends...');
      const trend = await trendService.getLatestTrend(dbService);
      if (trend) {
        log(`  → Selected trending topic: "${trend.title}"`);
        target = trend;
        payload = trend.researchChunks;
        sourceType = 'RESEARCH';
      }
    }

    if (!target) {
      log('Nothing to process today. System idling.');
      return;
    }

    // ─── 2. AI Content Generation ───
    log(`\n[2/4] Drafting script using ${sourceType === 'DOC' ? 'Document' : 'Research'} prompt...`);
    const script = await aiService.generateScript(payload, sourceType);
    
    log(`  → Analyzing script for metadata...`);
    const metadata = await aiService.generateMetadata(script, sourceType);

    // ─── 3. Video Production ───
    log('[3/4] Starting video production pipeline...');
    const outputDir = path.join(__dirname, 'output');
    fs.mkdirSync(outputDir, { recursive: true });

    const scriptPath = path.join(os.tmpdir(), `acm_script_${Date.now()}.txt`);
    fs.writeFileSync(scriptPath, script);

    const rawTitle = target.name || target.title;
    const safeName = rawTitle.replace(/\s+/g, '_').substring(0, 50);
    const videoPath = path.join(outputDir, `${safeName}_output.mp4`);
    
    await generateVideo(scriptPath, videoPath);
    fs.unlinkSync(scriptPath);

    // ─── 4. YouTube Upload ───
    log('[4/4] Uploading to YouTube...');
    
    const ytTitle = metadata?.title || `🔥 ${rawTitle} #Shorts`;
    const ytDesc = metadata?.description || `Auto-generated analysis of ${rawTitle}.`;
    const ytTags = metadata?.hashtags || ['AI', 'Automation', 'Trending', sourceType, 'Shorts'];

    await youtubeService.uploadVideo(videoPath, {
      title: ytTitle,
      description: `${ytDesc}\n\nTags: ${ytTags.join(' ')}`,
      tags: ytTags.map(t => t.replace('#', '')),
    });

    // ─── 5. Finalize Log ───
    if (sourceType === 'DOC') {
      await dbService.upsertFiles([target]);
    } else {
      await dbService.saveTrend(target);
    }
    log(`✓ ${sourceType} processed and logged successfully.`);

  } catch (err) {
    log(`✗ Pipeline Fatal Error: ${err.message}`);
    console.error(err.stack);
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
