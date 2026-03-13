const { google } = require('googleapis');

class DriveService {
  constructor(auth) {
    this.drive = google.drive({ version: 'v3', auth });
  }

  async listFilesInFolder(folderId) {
    try {
      const res = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
        spaces: 'drive',
      });
      return res.data.files;
    } catch (error) {
      throw new Error(`Drive API Error: ${error.message}`);
    }
  }
}

module.exports = DriveService;
