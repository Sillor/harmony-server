const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
  const drive = google.drive({version: 'v3', auth: authClient});
  const res = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log('No files found.');
    return;
  }

  console.log('Files:');
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
  });
}

authorize().then(listFiles).catch(console.error);

/**
 * Create a folder and prints the folder ID
 * @return{obj} folder Id
 * */
async function createFolder() {
  // Get credentials and build service
  // TODO (developer) - Use appropriate auth mechanism for your app

  const {GoogleAuth} = require('google-auth-library');
  const {google} = require('googleapis');

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/drive',
  });
  const service = google.drive({version: 'v3', auth});
  const fileMetadata = {
    name: 'Invoices',
    mimeType: 'application/vnd.google-apps.folder',
  };
  try {
    const file = await service.files.create({
      requestBody: fileMetadata,
      fields: 'id',
    });
    console.log('Folder Id:', file.data.id);
    return file.data.id;
  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
}

/**
 * Downloads a file
 * @param{string} realFileId file ID
 * @return{obj} file status
 * */
async function downloadFile(realFileId) {
  // Get credentials and build service
  // TODO (developer) - Use appropriate auth mechanism for your app

  const {GoogleAuth} = require('google-auth-library');
  const {google} = require('googleapis');

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/drive',
  });
  const service = google.drive({version: 'v3', auth});

  fileId = realFileId;
  try {
    const file = await service.files.get({
      fileId: fileId,
      alt: 'media',
    });
    console.log(file.status);
    return file.status;
  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
} 

//Mark file as trash
async function markTrash(){
  const body_value = {
    'trashed': True
  };

  const response = await drive_service.files.update({
        fileId: 'FILE_ID',
        requestBody: body_value,
      });
      return response;
}

/**
 * 
 1. To share a file in My Drive, the user must have role=writer or role=owner.

    -If the writersCanShare boolean value is set to False for the file, the user must have role=owner.

    -If the user with role=writer has temporary access governed by an expiration date and time, they can't share the file. For more information, see Set an expiration date to limit file access.

  2. To share a folder in My Drive, the user must have role=writer or role=owner.

    -If the writersCanShare boolean value is set to False for the file, the user must have the more permissive role=owner.

    -Temporary access (governed by an expiration date and time) isn't allowed on My Drive folders with role=writer. For more information, see Set an expiration date to limit file access.

  3. To share a file in a shared drive, the user must have role=writer, role=fileOrganizer, or role=organizer.

      -The writersCanShare setting doesn't apply to items in shared drives. It's treated as if it's always set to True.
  
  4. To share a folder in a shared drive, the user must have role=organizer.

      -If the sharingFoldersRequiresOrganizerPermission restriction on a shared drive is set to False, users with role=fileOrganizer can share folders in that shared drive.

  5. To manage shared drive membership, the user must have role=organizer. Only users and groups can be members of shared drives.


 */

/**
 * Create a drive.
 * */
async function createDrive() {
  // Get credentials and build service
  // TODO (developer) - Use appropriate auth mechanism for your app

  const {GoogleAuth} = require('google-auth-library');
  const {google} = require('googleapis');
  const uuid = require('uuid');

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/drive',
  });
  const service = google.drive({version: 'v3', auth});

  const driveMetadata = {
    name: 'Project resources',
  };
  const requestId = uuid.v4();
  try {
    const Drive = await service.drives.create({
      resource: driveMetadata,
      requestId: requestId,
      fields: 'id',
    });
    console.log('Drive Id:', Drive.data.id);
    return Drive.data.id;
  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
}

/**
 * If team leader leaves the group
 * Find all shared drives without an organizer and add one.
 * @param{string} userEmail user ID to assign ownership to
 * */
async function recoverDrives(userEmail) {
  // Get credentials and build service
  // TODO (developer) - Use appropriate auth mechanism for your app

  const {GoogleAuth} = require('google-auth-library');
  const {google} = require('googleapis');

  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/drive',
  });
  const service = google.drive({version: 'v3', auth});
  const drives = [];
  const newOrganizerPermission = {
    type: 'user',
    role: 'organizer',
    emailAddress: userEmail, // Example: 'user@example.com'
  };

  let pageToken = null;
  try {
    const res = await service.drives.list({
      q: 'organizerCount = 0',
      fields: 'nextPageToken, drives(id, name)',
      useDomainAdminAccess: true,
      pageToken: pageToken,
    });
    Array.prototype.push.apply(drives, res.data.items);
    for (const drive of res.data.drives) {
      console.log(
          'Found shared drive without organizer:',
          drive.name,
          drive.id,
      );
      await service.permissions.create({
        resource: newOrganizerPermission,
        fileId: drive.id,
        useDomainAdminAccess: true,
        supportsAllDrives: true,
        fields: 'id',
      });
    }
    pageToken = res.nextPageToken;
  } catch (err) {
    // TODO(developer) - Handle error
    throw err;
  }
  return drives;
}