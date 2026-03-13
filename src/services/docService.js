const { google } = require('googleapis');

class DocService {
  /**
   * @param {import('googleapis').Auth.GoogleAuth} auth - The authenticated Google client.
   */
  constructor(auth) {
    this.docs = google.docs({ version: 'v1', auth });
  }

  /**
   * Fetches a Google Document and parses its content into a clean array of strings (paragraphs).
   * @param {string} documentId - The exact ID of the Google Doc.
   * @returns {Promise<Array<string>>} An array of text paragraphs from the document.
   */
  async getDocumentContentAsArray(documentId) {
    try {
      const res = await this.docs.documents.get({ documentId });
      const content = res.data.body.content;
      
      const paragraphs = [];

      // Google Docs structures content as an array of 'Structural Elements'. 
      // We filter for Elements that are Paragraphs, and then extract the text elements inside them.
      content.forEach(element => {
        if (element.paragraph && element.paragraph.elements) {
          let paragraphText = '';
          element.paragraph.elements.forEach(textRun => {
            if (textRun.textRun && textRun.textRun.content) {
              paragraphText += textRun.textRun.content;
            }
          });
          // Clean up the text (remove trailing newlines which Google Docs adds to every block)
          const cleanText = paragraphText.trim();
          if (cleanText.length > 0) {
            paragraphs.push(cleanText);
          }
        }
      });

      return paragraphs;
    } catch (error) {
      throw new Error(`Docs API Error: Failed to fetch document ${documentId}. Details: ${error.message}`);
    }
  }

  /**
   * Checks if the document content array contains the exact '[READY]' tag.
   * @param {Array<string>} contentArray - The array of document paragraphs.
   * @returns {boolean} True if the document is flagged as ready.
   */
  isDocumentReady(contentArray) {
    // We check if any paragraph includes the keyword (allowing for accidental spaces)
    return contentArray.some(paragraph => paragraph.toUpperCase().includes('[READY]'));
  }
}

module.exports = DocService;
