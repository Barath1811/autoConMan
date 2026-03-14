const fs = require('fs');
const path = require('path');
const { config, validateConfig } = require('./src/config/config');
const AuthService = require('./src/services/authService');
const DriveService = require('./src/services/driveService');
const DBService = require('./src/services/dbService');
const DocService = require('./src/services/docService');
const AIService = require('./src/services/aiService');

async function main() {
  let dbService;
  try {
    validateConfig();

    const auth = new AuthService(config.googleCredentials).getAuth();
    const driveService = new DriveService(auth);
    const docService = new DocService(auth);
    const aiService = new AIService(config.geminiApiKey);

    // 1. Fetch files from Drive
    const fetchedFiles = await driveService.listFilesInFolder(config.driveFolderId);
    if (fetchedFiles.length === 0) {
      console.log('No files found in Drive folder.');
      return;
    }

    // 2. Open DB
    dbService = new DBService(config.dbConnectionString, config.dbName);
    await dbService.connect();

    const modifiedFiles = await dbService.getModifiedFiles(fetchedFiles);
    if (modifiedFiles.length === 0) {
      console.log('No new or modified files since the last execution.');
      return;
    }

    // 3. Process each delta file
    const processedFiles = [];
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    for (const file of modifiedFiles) {
      if (file.mimeType !== 'application/vnd.google-apps.document') continue;

      const contentArray = await docService.getDocumentContentAsArray(file.id);
      if (docService.isDocumentReady(contentArray)) {
        const payload = contentArray.filter(p => !p.toUpperCase().includes('[READY]'));
        console.log(`\n[READY] ${file.name} - Generating script...`);
        
        try {
          const script = await aiService.generateScript(payload);
          const outputPath = path.join(outputDir, `${file.name.replace(/\s+/g, '_')}_script.md`);
          fs.writeFileSync(outputPath, script);
          console.log(`  Script saved to: ${outputPath}`);
          processedFiles.push(file);
        } catch (aiError) {
          console.error(`  AI Script Generation Failed for ${file.name}:`, aiError.message);
        }
      } else {
        console.log(`[SKIP] ${file.name} — missing [READY] tag.`);
      }
    }

    // 4. Persist baseline
    if (processedFiles.length > 0) {
      await dbService.upsertFiles(processedFiles);
      console.log(`\nSaved ${processedFiles.length} file(s) to database.`);
    }

  } catch (error) {
    console.error('Execution Failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (dbService) await dbService.disconnect();
  }
}

if (require.main === module) {
  main();
}
