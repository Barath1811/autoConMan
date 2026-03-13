const { config, validateConfig } = require('./src/config/config');
const AuthService = require('./src/services/authService');
const DriveService = require('./src/services/driveService');
const DBService = require('./src/services/dbService');
const DocService = require('./src/services/docService');

async function main() {
  let dbService;
  try {
    validateConfig();

    const auth = new AuthService(config.googleCredentials).getAuth();
    const driveService = new DriveService(auth);
    const docService = new DocService(auth);

    // 1. Fetch files from Drive — no DB connection needed yet
    const fetchedFiles = await driveService.listFilesInFolder(config.driveFolderId);
    if (fetchedFiles.length === 0) {
      console.log('No files found in Drive folder.');
      return;
    }

    // 2. Open DB only now that we have files to compare
    dbService = new DBService(config.dbConnectionString);
    await dbService.connect();

    const modifiedFiles = await dbService.getModifiedFiles(fetchedFiles);
    if (modifiedFiles.length === 0) {
      console.log('No new or modified files since the last execution.');
      return;
    }

    // 3. Check content tag [READY] for each delta file
    const processedFiles = [];
    for (const file of modifiedFiles) {
      if (file.mimeType !== 'application/vnd.google-apps.document') continue;

      const contentArray = await docService.getDocumentContentAsArray(file.id);
      if (docService.isDocumentReady(contentArray)) {
        const payload = contentArray.filter(p => !p.toUpperCase().includes('[READY]'));
        console.log(`\n[READY] ${file.name}`);
        payload.forEach((p, i) => console.log(`  [${i + 1}] ${p}`));
        processedFiles.push(file);
      } else {
        console.log(`[SKIP] ${file.name} — missing [READY] tag.`);
      }
    }

    // 4. Persist baseline only for [READY] files
    if (processedFiles.length > 0) {
      await dbService.upsertFiles(processedFiles);
      console.log(`\nSaved ${processedFiles.length} file(s) to database.`);
    }

  } catch (error) {
    console.error('Execution Failed:', error.message);
    process.exitCode = 1;
  } finally {
    // Always close the connection if it was opened — even on error
    if (dbService) await dbService.disconnect();
  }
}

if (require.main === module) {
  main();
}
