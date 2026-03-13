const { config, validateConfig } = require('./src/config/config');
const AuthService = require('./src/services/authService');
const DriveService = require('./src/services/driveService');

async function main() {
  try {
    // 1. Configuration Validation (Fail fast if env vars are missing)
    validateConfig();

    console.log(`Starting execution... Fetching files for folder ID: ${config.driveFolderId}`);

    // 2. Authentication Initialization
    const authService = new AuthService(config.googleCredentials);
    const auth = authService.getAuth();

    // 3. Drive Service Initialization (Dependency Injection)
    const driveService = new DriveService(auth);

    // 4. Execute Core Business Logic
    const files = await driveService.listFilesInFolder(config.driveFolderId);
    
    // 5. Output Results
    if (files.length === 0) {
      console.log('No files found in the specified folder.');
    } else {
      console.log(`Successfully found ${files.length} files:\n`);
      files.forEach((file) => {
        console.log(`- [${file.mimeType}] ${file.name} (ID: ${file.id})`);
        console.log(`  Link: ${file.webViewLink}`);
        console.log(`  Created: ${file.createdTime} | Modified: ${file.modifiedTime}\n`);
      });
    }

  } catch (error) {
    console.error('Application Execution Failed:');
    console.error(error.message);
    process.exit(1);
  }
}

// Execute the main function if this file is run directly
if (require.main === module) {
  main();
}
