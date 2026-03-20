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

// Record that file loaded
try {
  fs.writeFileSync('index_loaded.txt', 'Loaded at ' + new Date().toISOString() + '\n', { flag: 'a' });
} catch (e) {}

const WORDS_PER_SEC = 2.8;
const FPS = 24;
const INTRO_DUR = 1.0;
const OUTRO_DUR = 1.0;
const PAUSE_DUR = 0.4;

// Simple logging function that writes to file
function log(msg) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}`;
  console.log(logMsg);
  try {
    fs.appendFileSync('pipeline.log', logMsg + '\n');
  } catch (e) {
    // Silent fail on log writes
  }
}

// ============================================================================
// STAGE 1: Parse script file into segment objects
// ============================================================================
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

// ============================================================================
// STAGE 2: Build mouth track array for a segment
// ============================================================================
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

// ============================================================================
// STAGE 3: Build frame manifest with intro, segments, pauses, outro
// ============================================================================
function buildFrameManifest(segments) {
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

// ============================================================================
// STAGE 4: Write manifest to JSON
// ============================================================================
function writeManifest(frames, manifestPath) {
  const manifest = {
    fps: FPS,
    totalFrames: frames.length,
    frames,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log('✓ Manifest written: ' + manifestPath + ' (' + frames.length + ' frames)');
}

// ============================================================================
// STAGE 5: Spawn Python renderer
// ============================================================================
function renderFrames(manifestPath, framesDir) {
  log('\nRendering frames with Python...');
  
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }

  // Use .venv Python on Windows for Cairo support
  let pythonCmd;
  if (process.platform === 'win32') {
    const venvPython = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
    pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';
  } else {
    pythonCmd = 'python3';
  }
  
  const result = spawnSync(pythonCmd, [
    path.join(__dirname, 'renderer.py'),
    manifestPath,
    framesDir,
  ], {
    stdio: 'inherit',
    timeout: 300000, // 5 minutes
  });

  if (result.error) {
    throw new Error(`Failed to spawn renderer: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Renderer exited with code ${result.status}`);
  }

  log('✓ Frames rendered');
}

// ============================================================================
// STAGE 6: Encode frames to MP4 using Python video encoder
// ============================================================================
// manifestPath and framesDir are passed explicitly to avoid any internal
// re-derivation that could pick up a stale manifest.json from a different path.
function encodeVideo(manifestPath, framesDir, outputPath) {
  log('\nEncoding video with Python encoder...');

  // Use .venv Python on Windows
  let pythonCmd;
  if (process.platform === 'win32') {
    const venvPython = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
    pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';
  } else {
    pythonCmd = 'python3';
  }

  // Pass framesDir explicitly so video_encoder.py doesn't have to derive it.
  const result = spawnSync(pythonCmd, [
    path.join(__dirname, 'video_encoder.py'),
    manifestPath,
    outputPath,
    '24',
    framesDir,
  ], {
    stdio: 'inherit',
    timeout: 600000, // 10 minutes
  });

  if (result.error) {
    throw new Error(`Failed to spawn video encoder: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Video encoder exited with code ${result.status}`);
  }

  log('✓ Video encoded: ' + outputPath);
}

// ============================================================================
// Pipeline mode: Direct script → video (CLI)
// ============================================================================
async function pipelineMode(scriptPath, outputPath) {
  const status = [];
  status.push('[PIPELINE] input=' + scriptPath);
  status.push('[PIPELINE] output=' + outputPath);

  // Use system temp dir for ALL intermediate files (manifest + frames).
  // This keeps them outside OneDrive/Dropbox/etc. which would lock files
  // during sync and cause PermissionError in the encoder.
  const runId = `autoconman_${Date.now()}_${process.pid}`;
  const tempWorkDir = path.join(os.tmpdir(), runId);
  const manifestPath = path.join(tempWorkDir, 'manifest.json');
  const framesDir = path.join(tempWorkDir, 'frames');

  try {
    fs.mkdirSync(tempWorkDir, { recursive: true });

    // 1. Parse script
    status.push('[1] Parsing script...');
    if (!fs.existsSync(scriptPath)) {
      throw new Error('Script file not found: ' + scriptPath);
    }
    const segments = parseScript(scriptPath);
    status.push('[1] OK - ' + segments.length + ' segments');
    log('\n=== PIPELINE MODE ===');
    log('Input:  ' + scriptPath);
    log('Output: ' + outputPath);
    log('Temp:   ' + tempWorkDir);

    // 2. Build manifest
    status.push('[2] Building manifest...');
    const frames = buildFrameManifest(segments);
    status.push('[2] OK - ' + frames.length + ' frames');
    log('\n[1/5] Parsing script...');
    log('✓ Parsed ' + segments.length + ' segments');

    // 3. Write manifest to temp dir
    status.push('[3] Writing manifest...');
    writeManifest(frames, manifestPath);
    status.push('[3] OK');

    log('\n[2/5] Building frame manifest...');
    log('✓ Built manifest with ' + frames.length + ' frames');

    // 4. Render frames into temp dir
    status.push('[4] Rendering frames...');
    log('\n[3/5] Writing manifest...');
    log('\n[4/5] Rendering frames...');
    renderFrames(manifestPath, framesDir);
    status.push('[4] OK');

    // 5. Encode video — reads from temp dir, writes final .mp4 to output/
    status.push('[5] Encoding video...');
    log('\n[5/5] Encoding video...');
    encodeVideo(manifestPath, framesDir, outputPath);
    status.push('[5] OK');

    log('\n✓✓✓ SUCCESS ✓✓✓');
    log('Video saved to: ' + outputPath);

    status.push('SUCCESS');
  } catch (error) {
    status.push('ERROR: ' + error.message);
    status.push(error.stack);
    log('\n✗ Pipeline failed: ' + error.message);
    process.exitCode = 1;
  } finally {
    // Always clean up the temp dir, whether the pipeline succeeded or failed.
    log('\nCleaning up temp dir: ' + tempWorkDir);
    fs.rmSync(tempWorkDir, { recursive: true, force: true });
  }

  // Always write status file
  fs.writeFileSync('pipeline_status.log', status.join('\n'));
}

// ============================================================================
// Drive mode: Fetch from Google Drive, generate scripts, produce videos
// ============================================================================
async function driveMode() {
  let dbService;
  try {
    validateConfig();

    const auth = new AuthService(config.googleCredentials).getAuth();
    const driveService = new DriveService(auth);
    const docService = new DocService(auth);
    const aiService = new AIService(config.geminiApiKey);

    // 1. Fetch files from Drive
    console.log('\n[1/X] Fetching files from Google Drive...');
    const fetchedFiles = await driveService.listFilesInFolder(config.driveFolderId);
    if (fetchedFiles.length === 0) {
      console.log('No files found in Drive folder.');
      return;
    }
    console.log(`✓ Found ${fetchedFiles.length} files`);

    // 2. Connect to DB
    console.log('\n[2/X] Connecting to database...');
    dbService = new DBService(config.dbConnectionString, config.dbName);
    await dbService.connect();

    const modifiedFiles = await dbService.getModifiedFiles(fetchedFiles);
    if (modifiedFiles.length === 0) {
      console.log('No new or modified files since last execution.');
      return;
    }
    console.log(`✓ Found ${modifiedFiles.length} new/modified files`);

    // 3. Process each file
    const processedFiles = [];
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    for (const file of modifiedFiles) {
      if (file.mimeType !== 'application/vnd.google-apps.document') continue;

      const contentArray = await docService.getDocumentContentAsArray(file.id);
      if (docService.isDocumentReady(contentArray)) {
        const payload = contentArray.filter(p => !p.toUpperCase().includes('[READY]'));
        console.log(`\n[READY] ${file.name}`);

        try {
          // Generate script from document
          console.log('  → Generating script with AI...');
          const script = await aiService.generateScript(payload);
          
          const scriptPath = path.join(outputDir, `${file.name.replace(/\s+/g, '_')}_script.txt`);
          fs.writeFileSync(scriptPath, script);
          console.log(`  ✓ Script saved: ${scriptPath}`);

          // Generate video from script
          const videoPath = path.join(outputDir, `${file.name.replace(/\s+/g, '_')}_output.mp4`);
          await pipelineMode(scriptPath, videoPath);

          processedFiles.push(file);
        } catch (error) {
          console.error(`  ✗ Processing failed: ${error.message}`);
        }
      } else {
        console.log(`[SKIP] ${file.name} — missing [READY] tag`);
      }
    }

    // 4. Update database
    if (processedFiles.length > 0) {
      console.log(`\nUpdating database with ${processedFiles.length} file(s)...`);
      await dbService.upsertFiles(processedFiles);
      console.log(`✓ Database updated`);
    }

  } catch (error) {
    console.error(`\n✗ Drive mode failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (dbService) await dbService.disconnect();
  }
}

// ============================================================================
// Main entry point
// ============================================================================
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 2) {
    // Pipeline mode: node index.js script.txt output.mp4
    await pipelineMode(args[0], args[1]);
  } else if (args.length === 0) {
    // Drive mode: node index.js
    await driveMode();
  } else {
    console.log('Usage:');
    console.log('  node index.js                          # Drive fetcher mode');
    console.log('  node index.js <script.txt> <output.mp4>  # Direct video generation');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  fs.writeFileSync('app_start.log', '[' + new Date().toISOString() + '] Starting\n');
  console.log('[START] autoConMan pipeline');
  main()
    .then(() => {
      fs.appendFileSync('app_start.log', 'SUCCESS\n');
      console.log('[END] Pipeline completed successfully');
      process.exit(0);
    })
    .catch(err => {
      fs.appendFileSync('app_start.log', 'ERROR: ' + err.message + '\n');
      console.error('[ERROR] Fatal error:', err);
      process.exit(1);
    });
}
