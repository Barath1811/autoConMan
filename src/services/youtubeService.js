'use strict';
const { google } = require('googleapis');
const fs = require('fs');

/**
 * Service for interacting with the YouTube Data API.
 */
class YouTubeService {
  /**
   * @param {Object} config - System configuration.
   */
  constructor(config) {
    // YouTube requires OAuth2 — service accounts cannot upload videos
    this.auth = new google.auth.OAuth2(
      config.youtubeClientId,
      config.youtubeClientSecret,
      config.youtubeRedirectUri
    );
    this.auth.setCredentials({ refresh_token: config.youtubeRefreshToken });
    this.youtube = google.youtube({ version: 'v3', auth: this.auth });
  }

  /**
   * Uploads a video file to YouTube.
   * @param {string} videoPath - Local path to the MP4 file.
   * @param {Object} metadata - Video metadata (title, description, tags).
   * @returns {Promise<Object>} The uploaded video resource.
   */
  async uploadVideo(videoPath, metadata) {
    console.log(`Uploading video: ${metadata.title}...`);
    const fileSize = fs.statSync(videoPath).size;

    const res = await this.youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description || '',
          tags: metadata.tags || [],
          categoryId: '28', // Science & Technology
        },
        status: {
          privacyStatus: 'public', // Change to 'unlisted' or 'private' for testing
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    }, {
      onUploadProgress: (evt) => {
        const pct = Math.round((evt.bytesRead / fileSize) * 100);
        process.stdout.write(`  → Uploading: ${pct}%\r`);
      },
    });
    console.log(`\n  ✓ Uploaded! Video ID: ${res.data.id}`);
    console.log(`  ✓ URL: https://www.youtube.com/watch?v=${res.data.id}`);
    return res.data;
  }

  /**
   * Sets a custom thumbnail for a YouTube video.
   * @param {string} videoId
   * @param {string} thumbnailPath - Local path to the image.
   * @returns {Promise<void>}
   */
  async setThumbnail(videoId, thumbnailPath) {
    console.log(`Setting thumbnail for video ${videoId}...`);
    try {
      await this.youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: 'image/png',
          body: fs.createReadStream(thumbnailPath),
        },
      });
      console.log(`  ✓ Thumbnail set for video: ${videoId}`);
    } catch (error) {
      // Thumbnail upload requires a verified channel — gracefully skip if not verified
      console.warn(`  ⚠ Thumbnail upload skipped: ${error.message}`);
    }
  }
}

module.exports = YouTubeService;
