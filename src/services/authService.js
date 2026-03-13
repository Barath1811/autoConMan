const { google } = require('googleapis');

class AuthService {
  /**
   * @param {string} credentialsStr - The JSON string representation of the Service Account credentials.
   */
  constructor(credentialsStr) {
    this.credentialsStr = credentialsStr;
  }

  /**
   * Parses credentials and returns an authenticated GoogleAuth client.
   * @returns {import('googleapis').Auth.GoogleAuth}
   */
  getAuth() {
    let credentials;
    try {
      credentials = JSON.parse(this.credentialsStr);
    } catch (error) {
      throw new Error("Authentication Error: Failed to parse GOOGLE_CREDENTIALS as JSON. Ensure it is a valid JSON string.");
    }

    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
  }
}

module.exports = AuthService;
