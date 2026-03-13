require('dotenv').config();

const config = {
  googleCredentials: process.env.GOOGLE_CREDENTIALS,
  driveFolderId: process.env.DRIVE_FOLDER_ID,
  dbConnectionString: process.env.DB_CONNECTION_STRING,
};

function validateConfig() {
  if (!config.googleCredentials) throw new Error('Missing GOOGLE_CREDENTIALS');
  if (!config.driveFolderId) throw new Error('Missing DRIVE_FOLDER_ID');
  if (!config.dbConnectionString) throw new Error('Missing DB_CONNECTION_STRING');
}

module.exports = { config, validateConfig };
