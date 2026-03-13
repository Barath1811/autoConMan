const { config, validateConfig } = require('./src/config/config');
const AuthService = require('./src/services/authService');
const DriveService = require('./src/services/driveService');
const DBService = require('./src/services/dbService');
const DocService = require('./src/services/docService');

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
    const docService = new DocService(auth);
    
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

    // 5. Check "Ready" Content Tag and Output Results
    if (modifiedFiles.length === 0) {
      console.log('No new or modified files since the last execution. No Delta.');
    } else {
      const processedFiles = [];

      for (const file of modifiedFiles) {
        // Only Google Docs can be parsed by the Docs API!
        if (file.mimeType !== 'application/vnd.google-apps.document') {
          console.log(`Skipping non-document file: ${file.name}`);
          continue;
        }

        const tag = file.isNewFile ? "[NEW]" : "[MODIFIED]";
        console.log(`\nInspecting Delta File: ${tag} ${file.name} (ID: ${file.id})...`);
        
        const contentArray = await docService.getDocumentContentAsArray(file.id);
        const isReady = docService.isDocumentReady(contentArray);

        if (isReady) {
          // Strip the [READY] tag itself from the content so we get only the document data
          const contentPayload = contentArray.filter(p => !p.toUpperCase().includes('[READY]'));
          console.log(`   --> Status: [READY]! Proceeding with data processing.`);
          console.log(`\n========= CONTENT PAYLOAD: ${file.name} (${contentPayload.length} paragraphs) =========`);
          contentPayload.forEach((paragraph, i) => {
            console.log(`   [${i + 1}] ${paragraph}`);
          });
          console.log(`=============================================================================\n`);
          
          processedFiles.push(file); // Only save files we actually processed
        } else {
          console.log(`   --> Status: Not Ready (Missing '[READY]' tag). Skipping DB update.`);
        }
      }

      // 6. Update Database Baseline (ONLY for files that were flagged as READY and fully processed!)
      if (processedFiles.length > 0) {
        await dbService.upsertFiles(processedFiles);
      } else {
        console.log('\nNo files were flagged as [READY] to process. Database baseline unchanged.');
      }
    }
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
