const { google } = require('googleapis');

class AuthService {
  constructor(credentialsStr) {
    this.credentialsStr = credentialsStr;
  }

  getAuth() {
    let credentials;
    try {
      credentials = JSON.parse(this.credentialsStr);
    } catch {
      throw new Error('Authentication Error: GOOGLE_CREDENTIALS is not valid JSON.');
    }
    return new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/youtube.upload',
      ],
    });
  }
}

module.exports = AuthService;
