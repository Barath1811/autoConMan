require('dotenv').config();

const config = {
  googleCredentials: process.env.GOOGLE_CREDENTIALS,
  driveFolderId: process.env.DRIVE_FOLDER_ID,
  dbConnectionString: process.env.DB_CONNECTION_STRING,
  dbName: process.env.DB_NAME || 'autoConManDB',
  geminiApiKey: process.env.GEMINI_API_KEY,
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID,
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
  youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
  defaultVoice: process.env.DEFAULT_VOICE || 'en-US-ChristopherNeural',
  aiModel: process.env.AI_MODEL || 'gemini-flash-latest',
  wordsPerSec: parseFloat(process.env.WORDS_PER_SEC) || 2.8,
  fps: parseInt(process.env.FPS) || 24,
  introDur: parseFloat(process.env.INTRO_DUR) || 1.0,
  outroDur: parseFloat(process.env.OUTRO_DUR) || 1.0,
  pauseDur: parseFloat(process.env.PAUSE_DUR) || 0.4,
};

function validateConfig() {
  if (!config.googleCredentials) throw new Error('Missing GOOGLE_CREDENTIALS');
  if (!config.driveFolderId) throw new Error('Missing DRIVE_FOLDER_ID');
  if (!config.dbConnectionString) throw new Error('Missing DB_CONNECTION_STRING');
  if (!config.geminiApiKey) throw new Error('Missing GEMINI_API_KEY');
  if (!config.youtubeClientId) throw new Error('Missing YOUTUBE_CLIENT_ID');
  if (!config.youtubeClientSecret) throw new Error('Missing YOUTUBE_CLIENT_SECRET');
  if (!config.youtubeRefreshToken) throw new Error('Missing YOUTUBE_REFRESH_TOKEN');
  if (!config.aiModel) throw new Error('Missing AI_MODEL');
}

module.exports = { config, validateConfig };
