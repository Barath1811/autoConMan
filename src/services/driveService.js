const { google } = require('googleapis');

/**
 * Service for interacting with the Google Drive API.
 */
class DriveService {
  /**
   * @param {Object} auth - Authenticated Google OAuth2 client.
   */
  constructor(auth) {
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Lists all files in a specific Google Drive folder.
   * @param {string} folderId 
   * @returns {Promise<Array<Object>>}
   */
  async listFilesInFolder(folderId) {
    try {
      const res = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, createdTime)', // Changed fields order
        spaces: 'drive',
      });
      return res.data.files;
    } catch (error) {
      throw new Error(`Drive API Error: ${error.message}`);
    }
  }
}

module.exports = DriveService;
