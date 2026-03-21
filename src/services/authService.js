const { google } = require('googleapis');

class AuthService {
  constructor(config) {
    this.config = config;
  }

  async getAuth() {
    let credentials;
    try {
      credentials = JSON.parse(this.config.googleCredentials);
    } catch {
      throw new Error('Authentication Error: GOOGLE_CREDENTIALS is not valid JSON.');
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/youtube.upload',
      ],
    });
    return await auth.getClient();
  }
}

module.exports = AuthService;
