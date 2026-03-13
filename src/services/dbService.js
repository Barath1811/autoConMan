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

class DBService {
  constructor(connectionString) {
    this.connectionString = connectionString;
  }

  async connect() {
    try {
      await mongoose.connect(this.connectionString, {
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
    const deltaFiles = [];
    for (const file of fetchedFiles) {
      const record = await DriveFileLog.findById(file.id);
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
}

module.exports = DBService;
