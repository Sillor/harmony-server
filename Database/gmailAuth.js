const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const {createUid} = require('./queries/general.js')
const { db,tables } = require('./db.js');
const {eq} = require('drizzle-orm')
const { findUser } = require('./queries/user.js');
const { google } = require('googleapis');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const fileUpload = require('express-fileupload');

require("dotenv").config()
const router = express.Router();
const client = new OAuth2Client(
  process.env.GOOGLE_OAUTH_CLIENT, 
  process.env.GOOGLE_OAUTH_SECRET, 
  'http://localhost:5000/api/auth/google/callback'
);

/* router.use((err, req, res, next) => {
  console.log("check req in gmail Auth - gmailAuth.js 25", req.body, req.file, req.file.name)
  if(err) console.log("error  file upload dependency", err)
next()
});
 */
router.use(session({
  name: 'session',
  secret: process.env.JWT_KEY,
  resave: false,
  saveUninitialized: false,
  cookie:{
    maxAge: 24 * 60 * 60 * 1000,
    secure: false,
    sameSite: 'strict'
  }
}));

//multer setup
const uploadDir = path.join(__dirname, '../uploads/temp')

//need fileUpload middleware to access req.files at endpoint
router.use(fileUpload({
  createParentPath: true,
  preserveExtension: true,
}));
/* router.use('*', (req, res, next) => {
  req.serverUploadPath = path.join(uploadDir, 'temp');
  if (!fs.existsSync(req.serverUploadPath)){
      fs.mkdirSync(req.serverUploadPath, {recursive: true});
      next();
  }else{
      next();
  }
})

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
      cb(null, req.serverUploadPath);
  },
  filename: function (req, file, cb) { 
    console.log("file name check")
      cb(null, file.originalname);
  }
});
const upload = multer({ storage }); */

async function obtainTeamName (chatId){
  let teamName = await db.select().from(tables.teams).where(eq(tables.teams.uid, chatId))
  return teamName[0]["name"]
}

////////////////////////////////////////////////////////////
//callback functions for files
async function createFolder (accessToken, folderId) {

  try {
    const drive = google.drive({ version: 'v3', auth: accessToken });
    console.log("creating folder - gmailAuth.js 104")
    const teamName = obtainTeamName(folderId)
    //create metadata
    const fileMetadata = {
      name: teamName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    
    //add folder to google drive
    const folder = await drive.files.create({
      requestBody: fileMetadata
    });
    return folder.data.id;
  } catch (error) {
    console.error('Error creating folder:', error, error.data);
    throw error;
  }
}

/* async function sendToGoogleDrive(filePath, {fileMetaData, mimeType, accessToken}){
// use multer to obtain file data using filePath 
  
const drive = google.drive({ version: 'v3', auth: accessToken });  
let fileData = fs.readFile(filePath, (err, data) => {
  if(err) console.log("error reading file", err)
  return data
});
console.log("check fileData read:", fileData)

const media = { 
mimeType, 
body: filePath, //hopefully i dont need to use fs 
};

const file = await drive.files.create({ 
  resource: fileMetaData, 
  media: media, 
  //fields: 'id', // Retrieve the file ID 
}); 
} */

async function uploadFile (accessToken, folderId, fileInfo, req) {
  try { 
    const drive = google.drive({ version: 'v3', auth: accessToken });  
    const fileName = fileInfo && fileInfo.name;
    const mimeType = fileInfo && fileInfo.mimetype;
    const teamName = obtainTeamName(folderId)
    const filePath =  fileInfo && path.join(req.serverUploadPath, fileName)

    const fileMetaData = { 
      name: fileName, 
      parents: [teamName], 
    }
    console.log("upload File - gmailAuth.js 128",fileName, filePath)
    /*
    file: {
        name: 'test1-google-service-account.json',
        data: <Buffer bytes>,
        size: 2374,
        encoding: '7bit',
        tempFilePath: '',
        truncated: false,
        mimetype: 'application/json',
        md5: '3bec3733fbe42b0292d563063ea111c0',
        mv: [Function: mv]
      }
    }

    */
    // Include the folder ID in the parents property }; 
      //const fileInfoObj = {fileMetaData, mimeType, accessToken}
      //console.log(fileInfoObj, filePath)
      //sendToGoogleDrive(filePath, fileInfoObj)
//////////////////////////////////////////////////////////////////////////
      let fileData = fs.readFile(filePath, (err, data) => {
        if(err) console.log("error reading file", err)
        console.log("file data check: ", data)
        return data
      });
      console.log("check fileData read:", fileData)
  
    const media = { 
      mimeType, 
      body: filePath, //hopefully i dont need to use fs 
    };
  
    const driveFile = await drive.files.create({ 
        resource: fileMetaData, 
        media: media, 
        //fields: 'id', // Retrieve the file ID 
      }); 
   // console.log("check file", file)
  
      return fileMetaData
    }
    catch (error) { 
      console.error('Error uploading file - gmailAuth.js 144:', error); 
      throw error;
    }
}


/////////////////////////////////////////////////////////////
//API endpoints Start

//add folder work on this 12/10/24

router.post('/drive/folder/:chatId', async (req, res) => {
  const folderName = req.params.chatId;
  try {
    const file = await createFolder(client, folderName);
    res.json(file);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ message: 'Server error' });
  }
})

//add file work on this 12/11/24
//for some reason body is not here
router.post('/drive/files/upload/:chatId', /* upload.single("file"), */ async (req, res) => {
  try {
    const folderName = req.params.chatId;
    const file = req.files && req.files.file;
    const tempDir = path.join(uploadDir, file.name)
    file.mv(tempDir, (err) =>{
       console.log(err)
      return err
      })
    console.log("endpoitn check", file)
    //const addToFolder = await uploadFile(client, folderName, file, req);
    res.json({/* addToFolder, */ "message": "file upload success"});
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ message: 'Server error' });
  }
})

//view folder info done 11/27/24

router.post('/drive/info', (req,res) => {
  const drive = google.drive('v3');
  const fileList = []

  drive.files.list({
    auth: client,
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  }, (err1, res1) => {
    if (err1) return console.log('The API returned an error: ' + err1);

    const files = res1.data.files;

    if (files.length) {
      console.log('Files:');
      files.map((file) => {
        console.log(`${file.name} (${file.id})`);
        fileList.push(file)
      });

    } else {
      console.log('No files found.');
    }
  });
  return res.json({"message": "you got the files matey", "folders": fileList})
})

/////////////////////////////////////////////////////////////
//Google Auth endpoints Start
//send to consent window
router.get('/consent-window', (req, res) => {
  console.log("consnet window - gmailAuth.js 151")
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 
    'https://www.googleapis.com/auth/userinfo.email', 
    'https://www.googleapis.com/auth/drive.file']
  });

  return res.json({url});
});
 
router.get('/callback', async (req, res) => {
  try{
    const uid = createUid()
    const { tokens } = await client.getToken(req.query.code);
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const existingUser = await findUser(payload.email)

    if(!existingUser){
      const linkUID = Array.from(Array(254), () => Math.floor(Math.random() * 36).toString(36)).join('')
      const hashedPW = await bcrypt.hash("NoPassword", 10)
      const hashedLinkHead = await bcrypt.hash(payload.email, 10)

      const userCallLink = `${hashedLinkHead}/${linkUID}`
      await db.insert(tables.users).values({
        email: payload.email,
        username: payload.given_name,
        password: hashedPW,
        userCallLink
      })
    }else{
      console.log("user Exists, will not add to user table")
    }

    if(tokens){
      try{
        let expiryDate = new Date(tokens.expiry_date)
        await db.insert(tables.gmailOAuth).values({
          uid,
          email: payload.email,
          authToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          scope: tokens.scope,
          tokenType: tokens.token_type,
          expiryDate,
        });
       
        const authDetails = {"email": payload.email, "username": payload.name, "accessToken": tokens.access_token}
        const accessToken = jwt.sign(authDetails, process.env.JWT_KEY, {expiresIn:'12h'});
        req.session.user = {payload:payload, authDetails:authDetails, token: accessToken, gmail:true};

      } catch (error) {
        console.log("error db ", error)
        res.json({"message": "error"});
        return
      }
    }
    
    res.redirect('http://localhost:5173/');
  } catch(error){
    console.log("error callback", error)
  }
});

router.get('/session-info', async (req, res) => {
  let userSession = req.session;

  if (userSession) { 
    res.json({ status: 200,  user: userSession.user, message: 'success' });
  } else {
    res.json({ status:401, message: 'Unauthorized' });
  }
});

router.post('/token-info/:email', async (req, res) => {
  //console.log("check session", req.session)
  let tokenInfo = await db.select().from(tables.gmailOAuth).where(eq(tables.gmailOAuth.email, req.params.email ))
  const expiryDate = tokenInfo && new Date(tokenInfo[tokenInfo.length-1].expiryDate).toLocaleString()
  const todayDate =  new Date().toLocaleString()
  const isExpired = expiryDate < todayDate || expiryDate === "Invalid Date"
 /*  
 setting refresh Token here
 1. set client credentials again
 2. set req.session.user
 

 let decodedToken = jwt.verify(tokenInfo[0].authToken, process.env.JWT_KEY , (err, user) => {
    if(err){
      console.log("auth expired")
      let refreshToken = jwt.sign(tokenInfo[0].refreshToken, process.env.JWT_KEY, (err, user) => {
        if(err){
          console.log("refresh sign err")
        }
        res.json({authToken: refreshToken})
      })
      return 
    }
  }) */
  //console.log("check tokenInfo", decodedToken
  return res.json({tokenInfo: tokenInfo[tokenInfo.length-1], expired: isExpired})
})

//is this fetch req proper for revoking token?
//should i select email instead of token?
router.delete('/logout/:token', async (req, res) => {
  console.log("check logout 330", req.body)
  let token = req.params.token
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
  await db.delete(tables.gmailOAuth).where(eq(tables.gmailOAuth.authToken, token))  

  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    
    res.clearCookie('session')
    res.json({status:200, success: true , message:"logged out"})
  })
});


module.exports = {router, client}
