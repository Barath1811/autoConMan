const { google } = require('googleapis');

class DocService {
  constructor(auth) {
    this.docs = google.docs({ version: 'v1', auth });
  }

  async getDocumentContentAsArray(documentId) {
    try {
      const res = await this.docs.documents.get({ documentId });
      const paragraphs = [];
      res.data.body.content.forEach(element => {
        if (element.paragraph?.elements) {
          const text = element.paragraph.elements
            .map(r => r.textRun?.content || '')
            .join('')
            .trim();
          if (text.length > 0) paragraphs.push(text);
        }
      });
      return paragraphs;
    } catch (error) {
      throw new Error(`Docs API Error: ${error.message}`);
    }
  }

  isDocumentReady(contentArray) {
    return contentArray.some(p => p.toUpperCase().includes('[READY]'));
  }
}

module.exports = DocService;
