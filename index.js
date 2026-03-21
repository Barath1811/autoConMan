'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { config, validateConfig } = require('./src/config/config');

const Logger = require('./src/services/logger');
const ResourceManager = require('./src/services/resourceManager');
const AuthService = require('./src/services/authService');
const DriveService = require('./src/services/driveService');
const DBService = require('./src/services/dbService');
const DocService = require('./src/services/docService');
const AIService = require('./src/services/aiService');
const YouTubeService = require('./src/services/youtubeService');
const TrendService = require('./src/services/trendService');

/**
 * Orchestrates the video generation pipeline, from content ingestion to YouTube upload.
 */
class VideoPipeline {
  /**
   * @param {Object} config - System configuration object.
   * @param {Object} services - Injected services.
   * @param {Object} services.driveService
   * @param {Object} services.docService
   * @param {Object} services.aiService
   * @param {Object} services.youtubeService
   * @param {Object} services.trendService
   * @param {Object} services.dbService
   * @param {Object} services.resourceManager
   */
  constructor(config, services) {
    this.config = config;
    this.driveService = services.driveService;
    this.docService = services.docService;
    this.aiService = services.aiService;
    this.youtubeService = services.youtubeService;
    this.trendService = services.trendService;
    this.dbService = services.dbService;
    this.resourceManager = services.resourceManager;
  }

  /**
   * Returns the command to run Python based on the OS.
   * @returns {string}
   */
  getPythonCmd() {
    if (process.platform === 'win32') {
      const venvPython = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
      return fs.existsSync(venvPython) ? venvPython : 'python';
    }
    return 'python3';
  }

  /**
   * Parses a script string into segments with expressions and durations.
   * @param {string} content - The script content.
   * @returns {Array<Object>}
   */
  parseScript(content) {
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
        duration: Math.max(1.5, words.length / this.config.wordsPerSec),
        totalFrames: Math.round(Math.max(1.5, words.length / this.config.wordsPerSec) * this.config.fps),
      });
    }
    return segments;
  }

  /**
   * Builds a frame manifest for the renderer.
   * @param {Array<Object>} segments - Parsed script segments.
   * @returns {Array<Object>}
   */
  buildFrameManifest(segments) {
    const frames = [];
    let fc = 0;
    const silence = (expr = 'IDLE', dur = this.config.introDur) => {
      for (let i = 0; i < Math.round(dur * this.config.fps); i++) {
        frames.push({ frame: fc++, expression: expr, mouth: 0, text: '', subVisible: false, wordIndex: -1, words: [] });
      }
    };
    silence('IDLE', this.config.introDur);
    for (const seg of segments) {
      const mouthTrack = this.buildMouthTrack(seg);
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
      silence('IDLE', this.config.pauseDur);
    }
    silence('WAVING', this.config.outroDur);
    return frames;
  }

  /**
   * Builds a lip-sync track for a script segment.
   * @param {Object} segment - Script segment.
   * @returns {Array<number>}
   */
  buildMouthTrack(segment) {
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

  /**
   * Executes the full pipeline.
   * @returns {Promise<void>}
   */
  async run() {
    try {
      await this.dbService.connect();
      Logger.info('[1/4] Scanning for new content...');
      
      const { target, payload, sourceType } = await this.ingestContent();
      if (!target) {
        Logger.info('Nothing to process today. System idling.');
        return;
      }

      Logger.info(`\n[2/4] Drafting script using ${sourceType === 'DOC' ? 'Document' : 'Research'} prompt...`);
      const script = await this.aiService.generateScript(payload, sourceType);
      Logger.info(`  → Analyzing script for metadata and thumbnail design...`);
      const { metadata, thumbnail: thumbnailData } = await this.aiService.generateVideoData(script, sourceType);

      Logger.info('[3/4] Starting video production pipeline...');
      const videoPath = await this.produceVideo(script, target, thumbnailData);

      Logger.info('[4/4] Uploading to YouTube...');
      await this.uploadToYouTube(videoPath, metadata, thumbnailData, target, sourceType);

      // Finalize Log
      if (sourceType === 'DOC') {
        await this.dbService.upsertFiles([target]);
      } else {
        await this.dbService.saveTrend(target);
      }
      Logger.info(`✓ ${sourceType} processed and logged successfully.`);

    } catch (err) {
      Logger.error(`Pipeline Fatal Error: ${err.message}`, err);
    } finally {
      await this.resourceManager.cleanup();
      await this.dbService.disconnect();
    }
  }

  /**
   * Ingests content from either Google Drive or Google Trends.
   * @returns {Promise<Object>}
   */
  async ingestContent() {
    const allFiles = await this.driveService.listFilesInFolder(this.config.driveFolderId);
    const newFiles = await this.dbService.getModifiedFiles(allFiles);
    
    for (const file of newFiles) {
      if (file.mimeType !== 'application/vnd.google-apps.document') continue;
      const content = await this.docService.getDocumentContentAsArray(file.id);
      if (this.docService.isDocumentReady(content)) {
        Logger.info(`  → Selected [READY] Drive file: "${file.name}"`);
        return {
          target: file,
          payload: content.filter(p => !p.toUpperCase().includes('[READY]')),
          sourceType: 'DOC'
        };
      }
    }

    Logger.info('  → No ready files in Drive. Checking Google Trends...');
    const trend = await this.trendService.getLatestTrend(this.dbService);
    if (trend) {
      Logger.info(`  → Selected trending topic: "${trend.title}"`);
      return {
        target: trend,
        payload: trend.researchChunks,
        sourceType: 'RESEARCH'
      };
    }

    return { target: null, payload: null, sourceType: null };
  }

  /**
   * Spawns a child process and returns a promise that resolves on completion.
   * @param {string} cmd - Command to run.
   * @param {string[]} args - Command arguments.
   * @param {Object} options - Spawn options.
   * @returns {Promise<void>}
   */
  execProcess(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = require('child_process').spawn(cmd, args, {
        stdio: 'inherit',
        ...options
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Process ${cmd} failed with code ${code}`));
      });
      proc.on('error', (err) => reject(new Error(`Failed to spawn ${cmd}: ${err.message}`)));
    });
  }

  /**
   * Orchestrates the frame rendering and video encoding.
   * @param {string} script - The voiceover script.
   * @param {Object} target - The data source object.
   * @param {Object} thumbnailData - Thumbnail design data.
   * @returns {Promise<string>} Path to the generated video.
   */
  async produceVideo(script, target, thumbnailData) {
    const runId = `autoconman_${Date.now()}_${process.pid}`;
    const tempDir = path.join(os.tmpdir(), runId);
    this.resourceManager.addDir(tempDir);
    
    const manifestPath = path.join(tempDir, 'manifest.json');
    const framesDir = path.join(tempDir, 'frames');
    fs.mkdirSync(tempDir, { recursive: true });

    const segments = this.parseScript(script);
    const frames = this.buildFrameManifest(segments);
    fs.writeFileSync(manifestPath, JSON.stringify({ fps: this.config.fps, totalFrames: frames.length, frames }, null, 2));

    Logger.info('Rendering frames...');
    await this.execProcess(this.getPythonCmd(), [path.join(__dirname, 'renderer.py'), manifestPath, framesDir], { timeout: 300_000 });

    const rawTitle = target.name || target.title;
    const safeName = rawTitle.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').substring(0, 50);
    const outputDir = path.join(__dirname, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const videoPath = path.join(outputDir, `${safeName}_output.mp4`);

    Logger.info('Encoding video...');
    await this.execProcess(this.getPythonCmd(), [path.join(__dirname, 'video_encoder.py'), manifestPath, videoPath, String(this.config.fps), framesDir], { timeout: 600_000 });

    return videoPath;
  }

  /**
   * Uploads the video and sets a custom thumbnail.
   * @param {string} videoPath - Local path to the video file.
   * @param {Object} metadata - AI-generated title/desc/tags.
   * @param {Object} thumbnailData - Thumbnail design data.
   * @param {Object} target - Source data object.
   * @param {string} sourceType - Type of source (DOC or RESEARCH).
   * @returns {Promise<void>}
   */
  async uploadToYouTube(videoPath, metadata, thumbnailData, target, sourceType) {
    const rawTitle = target.name || target.title;
    const ytTitle = (metadata?.title || `🔥 ${rawTitle}`).replace(/#Shorts/gi, '').trim();
    const ytDesc = (metadata?.description || `Top news analysis of ${rawTitle}.`).replace(/#(AI|Automation)/gi, '').trim();
    let ytTags = metadata?.hashtags || ['Trending', sourceType];
    ytTags = ytTags.filter(t => !['#AI', '#Automation', 'AI', 'Automation', '#Shorts', 'Shorts'].includes(t.replace('#', '')));

    const videoData = await this.youtubeService.uploadVideo(videoPath, {
      title: ytTitle,
      description: `${ytDesc}\n\nTags: ${ytTags.join(' ')}`,
      tags: ytTags.map(t => t.replace('#', '')),
    });

    // Generate and set thumbnail
    Logger.info('  → Rendering AI thumbnail...');
    const outputDir = path.dirname(videoPath);
    const safeName = path.basename(videoPath, '_output.mp4');
    const thumbnailPath = path.join(outputDir, `${safeName}_thumbnail.png`);

    const validThemes = ['SPORTS', 'FINANCE', 'POLITICS', 'DISASTER', 'ENTERTAINMENT', 'TECHNOLOGY', 'DEFAULT'];
    const validPoses = ['HAPPY', 'SAD', 'ANGRY', 'SURPRISED', 'LAUGHING', 'WAVING', 'THINK', 'IDLE'];
    const theme = validThemes.includes(thumbnailData.theme?.toUpperCase()) ? thumbnailData.theme.toUpperCase() : 'DEFAULT';
    const pose = validPoses.includes(thumbnailData.characterPose?.toUpperCase()) ? thumbnailData.characterPose.toUpperCase() : 'IDLE';
    const title = (thumbnailData.twoWordTitle || 'BREAKING NEWS').substring(0, 40);
    const accent = /^#[0-9A-F]{6}$/i.test(thumbnailData.accentHex) ? thumbnailData.accentHex : '#7C4DFF';

    try {
      await this.execProcess(this.getPythonCmd(), [path.join(__dirname, 'thumbnail_generator.py'), theme, title, pose, accent, thumbnailPath], { timeout: 60_000 });
      if (fs.existsSync(thumbnailPath) && videoData?.id) {
        await this.youtubeService.setThumbnail(videoData.id, thumbnailPath);
        Logger.info(`  ✓ Thumbnail uploaded: ${thumbnailPath}`);
      }
    } catch (error) {
      Logger.warn(`  ⚠ Thumbnail generation failed or skipped: ${error.message}`);
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
if (require.main === module) {
  validateConfig();
  console.log('[autoConMan] Starting pipeline...');
  
  // Service Instantiation (Composition Root)
  const authService = new AuthService(config);
  const auth = authService.getAuth();
  
  const services = {
    driveService: new DriveService(auth),
    docService: new DocService(auth),
    aiService: new AIService(config),
    youtubeService: new YouTubeService(config),
    trendService: new TrendService(),
    dbService: new DBService(config.dbConnectionString, config.dbName),
    resourceManager: new ResourceManager(),
  };

  const pipeline = new VideoPipeline(config, services);
  pipeline.run()
    .then(() => {
      console.log('[autoConMan] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[autoConMan] Fatal error during initialization:', err.message);
      process.exit(1);
    });
}
