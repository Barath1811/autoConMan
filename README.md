# autoConMan - Google Drive Fetcher

A Node.js application that runs on a GitHub Actions cron schedule to fetch a list of files from a shared Google Drive folder.

## Setup Instructions

### 1. Google Cloud Service Account
Since this runs automatically via GitHub Actions, we use a Service Account for authentication.
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project (or select an existing one).
3. Enable the **Google Drive API** for your project: Go to "APIs & Services" > "Enable APIs and Services", search for "Google Drive API" and click Enable.
4. Go to **IAM & Admin > Service Accounts** and create a new Service Account. Give it a name like `github-actions-drive-bot`.
5. Once created, click on the Service Account, go to the **Keys** tab, click **Add Key > Create new key**, and choose **JSON**.
6. A JSON file will download to your computer. Open it with a text editor and copy its entire contents. This will be your `GOOGLE_CREDENTIALS` secret.

### 2. Share the Google Drive Folder
1. Find the email address of the Service Account you just created (it looks like `name@project.iam.gserviceaccount.com`).
2. Go to your Google Drive, right-click the folder you want to fetch files from, and click **Share**.
3. Paste the Service Account email address and give it **Viewer** access (this is enough to read file lists).
4. Get the Folder ID from the URL. For example, if the folder URL is `https://drive.google.com/drive/folders/1ABCDEFG12345678`, the ID is `1ABCDEFG12345678`. This will be your `DRIVE_FOLDER_ID` secret.

### 3. GitHub Secrets Configuration
1. Push this repository to GitHub.
2. Go to your GitHub repository page.
3. Navigate to **Settings > Secrets and variables > Actions**.
4. Click **New repository secret**:
   - **Name**: `GOOGLE_CREDENTIALS`
   - **Secret**: *(Paste the ENTIRE contents of the Service Account JSON file here)*
5. Click **New repository secret** again:
   - **Name**: `DRIVE_FOLDER_ID`
   - **Secret**: *(Paste the Google Drive Folder ID here)*

## Running the Application

- **Automatically**: The GitHub Action is scheduled to run every day at 00:00 UTC (as defined in `.github/workflows/cron.yml`).
- **Manually via GitHub**: Go to the **Actions** tab in your repository, select the "Fetch Drive Files Cron" workflow, and click **Run workflow**.

### Testing Locally
If you want to test the script on your own computer before pushing:
1. Ensure Node.js is installed.
2. Run `npm install` to install the `googleapis` and `dotenv` packages.
3. Create a `.env` file in the root directory (make sure it's ignored in `.gitignore`) and add your secrets:
   ```env
   GOOGLE_CREDENTIALS={"type":"service_account","project_id":"...
   DRIVE_FOLDER_ID=1ABCDEFG12345678
   ```
4. Run `npm start`.
