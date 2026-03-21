const mongoose = require('mongoose');

const DriveFileLogSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  mimeType: { type: String, required: true },
  webViewLink: { type: String },
  createdTime: { type: Date },
  modifiedTime: { type: Date, required: true },
  lastFetchedAt: { type: Date, default: Date.now },
});

const DriveFileLog = mongoose.model('DriveFileLog', DriveFileLogSchema);
 
const TrendLogSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  description: { type: String },
  thumbnail: { type: String },
  sourceUrls: [{ type: String }],
  processedAt: { type: Date, default: Date.now },
});

const TrendLog = mongoose.model('TrendLog', TrendLogSchema);

/**
 * Handles all database interactions using Mongoose.
 */
class DBService {
  /**
   * @param {string} connectionString - MongoDB URI.
   * @param {string} dbName - Database name.
   */
  constructor(connectionString, dbName) {
    this.connectionString = connectionString;
    this.dbName = dbName;
  }

  /**
   * Connects to the database.
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      await mongoose.connect(this.connectionString, {
        dbName: this.dbName,
      });
      console.log('Successfully connected to MongoDB');
    } catch (error) {
      console.error('Error connecting to MongoDB:', error.message);
      throw error;
    }
  }

  /**
   * Disconnects from the database.
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      await mongoose.connection.close();
      console.log('Successfully disconnected from MongoDB');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error.message);
      throw error;
    }
  }

  /**
   * Filters a list of files to identify those that are new or have been modified since the last fetch.
   * @param {Array<Object>} fetchedFiles - Files from Google Drive.
   * @returns {Promise<Array<Object>>}
   */
  async getModifiedFiles(fetchedFiles) {
    if (!fetchedFiles || fetchedFiles.length === 0) return [];
    
    const fileIds = fetchedFiles.map(f => f.id);
    const existingRecords = await DriveFileLog.find({ _id: { $in: fileIds } });
    const recordMap = new Map(existingRecords.map(r => [r._id, r]));

    const deltaFiles = [];
    for (const file of fetchedFiles) {
      const record = recordMap.get(file.id);
      const driveModifiedTime = new Date(file.modifiedTime);

      if (!record) {
        file.isNewFile = true;
        deltaFiles.push(file);
        continue;
      }

      if (driveModifiedTime > new Date(record.lastFetchedAt)) {
        file.isModifiedFile = true;
        deltaFiles.push(file);
      }
    }
    return deltaFiles;
  }

  /**
   * Updates or creates log entries for the specified files.
   * @param {Array<Object>} files - Files to log.
   * @returns {Promise<void>}
   */
  async upsertFiles(files) {
    const now = new Date();
    for (const file of files) {
      await DriveFileLog.findByIdAndUpdate(
        file.id,
        {
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
          createdTime: new Date(file.createdTime),
          modifiedTime: new Date(file.modifiedTime),
          lastFetchedAt: now,
        },
        { upsert: true }
      );
    }
  }
  /**
   * Checks if a trending topic has already been processed within the exclusion window.
   * @param {string} trendTitle 
   * @returns {Promise<boolean>}
   */
  async isTrendProcessed(trendTitle) {
    const exclusionPeriod = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    const existing = await TrendLog.findOne({
      title: trendTitle,
      processedAt: { $gte: exclusionPeriod },
    });
    return !!existing;
  }

  /**
   * Logs a processed trend topic.
   * @param {Object} trendData 
   * @returns {Promise<void>}
   */
  async saveTrend(trendData) {
    await TrendLog.updateOne(
      { title: trendData.title },
      {
        $set: {
          description: trendData.description,
          thumbnail: trendData.thumbnail,
          sourceUrls: trendData.sourceUrls,
          processedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
}

module.exports = DBService;
