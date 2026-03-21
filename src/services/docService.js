const { google } = require('googleapis');

/**
 * Service for interacting with Google Docs.
 */
class DocService {
  /**
   * @param {Object} auth - Authenticated Google OAuth2 client.
   */
  constructor(auth) {
    this.docs = google.docs({ version: 'v1', auth });
  }

  /**
   * Retrieves the plain text content of a Google Doc as an array of paragraph strings.
   * @param {string} documentId 
   * @returns {Promise<string[]>}
   */
  async getDocumentContentAsArray(documentId) {
    const doc = await this.docs.documents.get({ documentId });
    const content = doc.data.body.content;
    const lines = [];

    content.forEach((element) => {
      if (element.paragraph) {
        element.paragraph.elements.forEach((el) => {
          if (el.textRun) {
            lines.push(el.textRun.content);
          }
        });
      }
    });

    return lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Checks if a document is marked as [READY] for processing.
   * @param {string[]} contentArray 
   * @returns {boolean}
   */
  isDocumentReady(contentArray) {
    return contentArray.some((line) => line.toUpperCase().includes('[READY]'));
  }
}

module.exports = DocService;
