require('dotenv').config();

const config = {
  googleCredentials: process.env.GOOGLE_CREDENTIALS,
  driveFolderId: process.env.DRIVE_FOLDER_ID,
  dbConnectionString: process.env.DB_CONNECTION_STRING,
};

function validateConfig() {
  if (!config.googleCredentials) {
    throw new Error("Configuration Error: GOOGLE_CREDENTIALS environment variable is not set. Make sure to add the Service Account JSON as a GitHub Secret.");
  }
  if (!config.driveFolderId) {
    throw new Error("Configuration Error: DRIVE_FOLDER_ID environment variable is not set. Make sure to add the Folder ID as a GitHub Secret.");
  }
  if (!config.dbConnectionString) {
    throw new Error("Configuration Error: DB_CONNECTION_STRING environment variable is not set. Add your MongoDB connection string to .env or GitHub Secrets.");
  }
}

module.exports = {
  config,
  validateConfig,
};
