'use strict';
const { google } = require('googleapis');

/**
 * Service for managing Google OAuth2 authentication.
 */
class AuthService {
  /**
   * @param {Object} config - System configuration.
   */
  constructor(config) {
    this.auth = new google.auth.OAuth2(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri
    );
    this.auth.setCredentials({ refresh_token: config.googleRefreshToken });
  }

  /**
   * Returns the authenticated OAuth2 client.
   * @returns {Object}
   */
  getAuth() {
    return this.auth;
  }
}

module.exports = AuthService;
