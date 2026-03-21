'use strict';
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

/**
 * Manages temporary files and directories, ensuring they are cleaned up after use.
 */
class ResourceManager {
  constructor() {
    this.tempFiles = new Set();
    this.tempDirs = new Set();
  }

  /**
   * Registers a file path for cleanup.
   * @param {string} filePath 
   */
  addFile(filePath) {
    this.tempFiles.add(path.resolve(filePath));
  }

  /**
   * Registers a directory path for cleanup.
   * @param {string} dirPath 
   */
  addDir(dirPath) {
    this.tempDirs.add(path.resolve(dirPath));
  }

  /**
   * Recursively deletes all registered files and directories.
   * @returns {Promise<void>}
   */
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
