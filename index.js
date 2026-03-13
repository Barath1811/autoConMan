const { config, validateConfig } = require('./src/config/config');
const AuthService = require('./src/services/authService');
const DriveService = require('./src/services/driveService');
const DBService = require('./src/services/dbService');

async function main() {
  let dbService;
  try {
    // 1. Configuration Validation
    validateConfig();

    console.log(`Starting execution... Fetching files for folder ID: ${config.driveFolderId}`);

    // 2. Service Initialization
    const authService = new AuthService(config.googleCredentials);
    const auth = authService.getAuth();
    const driveService = new DriveService(auth);
    
    dbService = new DBService(config.dbConnectionString);
    await dbService.connect();

    // 3. Fetch from Google Drive
    const fetchedFiles = await driveService.listFilesInFolder(config.driveFolderId);
    
    if (fetchedFiles.length === 0) {
      console.log('No files found in the specified Google Drive folder.');
      await dbService.disconnect();
      return;
    }

    // 4. Determine Delta (New/Modified files)
    const modifiedFiles = await dbService.getModifiedFiles(fetchedFiles);

    // 5. Output Results (Delta Only)
    if (modifiedFiles.length === 0) {
      console.log('No new or modified files since the last execution. No Delta.');
    } else {
      console.log(`\n========= FOUND ${modifiedFiles.length} MODIFIED/NEW FILES =========`);
      modifiedFiles.forEach((file) => {
        const tag = file.isNewFile ? "[NEW]" : "[MODIFIED]";
        console.log(`- ${tag} [${file.mimeType}] ${file.name} (ID: ${file.id})`);
        console.log(`  Link: ${file.webViewLink}`);
        console.log(`  Created: ${file.createdTime} | Drive Modified DB Baseline: ${file.modifiedTime}\n`);
      });
      console.log(`========================================================\n`);
    }

    // 6. Update Database Baseline
    await dbService.upsertFiles(fetchedFiles);
    console.log('Execution completed successfully!');

  } catch (error) {
    console.error('Application Execution Failed:');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (dbService) {
      await dbService.disconnect();
    }
  }
}

// Execute the main function if this file is run directly
if (require.main === module) {
  main();
}
