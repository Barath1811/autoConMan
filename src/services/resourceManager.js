'use strict';
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

class ResourceManager {
  constructor() {
    this.tempFiles = new Set();
    this.tempDirs = new Set();
  }

  addFile(filePath) {
    this.tempFiles.add(path.resolve(filePath));
  }

  addDir(dirPath) {
    this.tempDirs.add(path.resolve(dirPath));
  }

  async cleanup() {
    Logger.info('Cleaning up resources...');
    
    for (const filePath of this.tempFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          Logger.debug(`Deleted file: ${filePath}`);
        }
      } catch (err) {
        Logger.warn(`Failed to delete file ${filePath}: ${err.message}`);
      }
    }

    for (const dirPath of this.tempDirs) {
      try {
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          Logger.debug(`Deleted directory: ${dirPath}`);
        }
      } catch (err) {
        Logger.warn(`Failed to delete directory ${dirPath}: ${err.message}`);
      }
    }

    this.tempFiles.clear();
    this.tempDirs.clear();
  }
}

module.exports = ResourceManager;
