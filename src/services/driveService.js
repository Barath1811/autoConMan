const { google } = require('googleapis');

class DriveService {
  /**
   * @param {import('googleapis').Auth.GoogleAuth} auth - The authenticated Google client.
   */
  constructor(auth) {
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Lists files inside a specific Google Drive folder.
   * @param {string} folderId - The ID of the Google Drive folder.
   * @returns {Promise<Array>} A promise that resolves to an array of file objects.
   */
  async listFilesInFolder(folderId) {
    try {
      const res = await this.drive.files.list({
        // Filters files by parent folder ID, and ensures they aren't in the trash
        q: `'${folderId}' in parents and trashed = false`,
        // Specifically request the fields we need to reduce bandwidth and parse time
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
        spaces: 'drive',
      });
      return res.data.files;
    } catch (error) {
      throw new Error(`Drive API Error: Failed to list files. Details: ${error.message}`);
    }
  }
}

module.exports = DriveService;
