const mongoose = require('mongoose');

// Define Schema mapping the Google Drive Output
const DriveFileLogSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // The Google Drive ID serves as the exact MongoDB _id
  name: { type: String, required: true },
  mimeType: { type: String, required: true },
  webViewLink: { type: String },
  createdTime: { type: Date },
  
  // The crucial fields for our Delta check
  modifiedTime: { type: Date, required: true },
  lastFetchedAt: { type: Date, default: Date.now },
});

const DriveFileLog = mongoose.model('DriveFileLog', DriveFileLogSchema);

class DBService {
  /**
   * @param {string} connectionString - The MongoDB connection string URI.
   */
  constructor(connectionString) {
    this.connectionString = connectionString;
  }

  /**
   * Connects to the MongoDB database.
   */
  async connect() {
    try {
      await mongoose.connect(this.connectionString, {
        serverApi: {
          version: '1',
          strict: true,
          deprecationErrors: true,
        }
      });
      console.log('Successfully connected to MongoDB.');
    } catch (error) {
      throw new Error(`Database Error: Failed to connect to MongoDB. Details: ${error.message}`);
    }
  }

  /**
   * Disconnects from the MongoDB database (cleanup for the Node script exit).
   */
  async disconnect() {
    await mongoose.disconnect();
  }

  /**
   * Compares fetched Drive files against the DB and returns only New or Modified ones.
   * @param {Array} fetchedFiles - Files retrieved from Google Drive API.
   * @returns {Promise<Array>} List of delta (new or modified) files.
   */
  async getModifiedFiles(fetchedFiles) {
    const deltaFiles = [];

    for (const file of fetchedFiles) {
      const existingRecord = await DriveFileLog.findById(file.id);
      const driveModifiedTime = new Date(file.modifiedTime);

      // If record doesn't exist, it's a NEW file
      if (!existingRecord) {
        file.isNewFile = true; // Tag it for our console output
        deltaFiles.push(file);
        continue;
      }

      // If record exists, compare Drive's modifiedTime against our lastFetchedAt.
      // We use lastFetchedAt (when WE last ran) rather than modifiedTime so that
      // ANY edit after our last execution is always detected as a delta.
      const lastFetchedAt = new Date(existingRecord.lastFetchedAt);
      if (driveModifiedTime > lastFetchedAt) {
        file.isModifiedFile = true; // Tag it for our console output
        deltaFiles.push(file);
      }
    }

    return deltaFiles;
  }

  /**
   * Updates or Inserts all fetched files into the DB, establishing the new baseline.
   * @param {Array} fetchedFiles - Files retrieved from Google Drive API.
   */
  async upsertFiles(fetchedFiles) {
    console.log(`Updating Database with ${fetchedFiles.length} file records...`);

    for (const file of fetchedFiles) {
      await DriveFileLog.updateOne(
        { _id: file.id },
        { 
          $set: {
            name: file.name,
            mimeType: file.mimeType,
            webViewLink: file.webViewLink,
            createdTime: new Date(file.createdTime),
            modifiedTime: new Date(file.modifiedTime),
            lastFetchedAt: new Date()
          }
        },
        { upsert: true } // If not found, insert it
      );
    }
  }
}

module.exports = DBService;
