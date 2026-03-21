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

class DBService {
  constructor(connectionString, dbName) {
    this.connectionString = connectionString;
    this.dbName = dbName;
  }

  async connect() {
    try {
      await mongoose.connect(this.connectionString, {
        dbName: this.dbName,
        serverApi: { version: '1', strict: true, deprecationErrors: true }
      });
    } catch (error) {
      throw new Error(`Database Error: Failed to connect. Details: ${error.message}`);
    }
  }

  async disconnect() {
    await mongoose.disconnect();
  }

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

  async upsertFiles(files) {
    for (const file of files) {
      await DriveFileLog.updateOne(
        { _id: file.id },
        {
          $set: {
            name: file.name,
            mimeType: file.mimeType,
            webViewLink: file.webViewLink,
            createdTime: new Date(file.createdTime),
            modifiedTime: new Date(file.modifiedTime),
            lastFetchedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }

  async isTrendProcessed(title) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const record = await TrendLog.findOne({
      title: { $regex: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      processedAt: { $gte: oneYearAgo }
    });
    return !!record;
  }

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
