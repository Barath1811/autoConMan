'use strict';
const { google } = require('googleapis');
const fs = require('fs');

class YouTubeService {
  constructor(config) {
    // YouTube requires OAuth2 — service accounts cannot upload videos
    this.oauth2Client = new google.auth.OAuth2(
      config.youtubeClientId,
      config.youtubeClientSecret,
      config.youtubeRedirectUri
    );
    this.oauth2Client.setCredentials({
      refresh_token: config.youtubeRefreshToken,
    });
    this.youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
  }

  async uploadVideo(videoPath, metadata) {
    console.log(`  → Uploading to YouTube: "${metadata.title}"`);
    const fileSize = fs.statSync(videoPath).size;

    const response = await this.youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description || '',
          tags: metadata.tags || [],
          categoryId: metadata.categoryId || '22',
        },
        status: {
          privacyStatus: metadata.privacyStatus || 'public',
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

    console.log(`\n  ✓ Uploaded! Video ID: ${response.data.id}`);
    console.log(`  ✓ URL: https://www.youtube.com/watch?v=${response.data.id}`);
    return response.data;
  }
  async setThumbnail(videoId, thumbnailPath) {
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
