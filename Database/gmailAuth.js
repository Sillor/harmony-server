const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {createUid} = require("./queries/general.js")
const { db,tables } = require("./db.js");
const {eq} = require("drizzle-orm")
const { findUser } = require('./queries/user.js');
const { google } = require('googleapis');

require("dotenv").config()
const router = express.Router();
const client = new OAuth2Client(
  process.env.GOOGLE_OAUTH_CLIENT, 
  process.env.GOOGLE_OAUTH_SECRET, 
  'http://localhost:5000/api/auth/google/callback'
);
console.log("gmailAuth file")
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

//callback functions for files
async function createFolder (accessToken, folderName, body) {

  try {
    const drive = google.drive({ version: 'v3', auth: accessToken });
    console.log("creating folder")
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    console.log("file meta data", fileMetadata, "/n", body)
    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: folderName
    });
    return folder.data.id;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

async function addFile (accessToken, folderName, body) {

  try {
    const drive = google.drive({ version: 'v3', auth: accessToken });
    console.log("creating folder")
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    console.log("file meta data", fileMetadata, "/n", body)
    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: folderName
    });
    return folder.data.id;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

//api endpoints start

//add folder work on this 12/10/24

router.post('/drive/folder/:chatId', async (req, res) => {
  const folderName = req.params.chatId;
  console.log("folder name", folderName)
  try {
    const folder = await createFolder(client, folderName, req.body);
    res.json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ message: 'Server error' });
  }
})

//add file work on this 12/11/24

router.post('/drive/files/upload/:chatId', async (req, res) => {
  const folderName = req.params.chatId;
  console.log(folderName)
  try {
    const addToFolder = await addFile(client, folderName, req.body);
    res.json(addToFolder);
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



//send to consent window
router.get('/consent-window', (req, res) => {
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

router.get('/token-info/:email', async (req, res) => {
  //console.log("check session", req.session)
  let tokenInfo = await db.select().from(tables.gmailOAuth).where(eq(tables.gmailOAuth.email, req.params.email ))
  
 /*  let decodedToken = jwt.verify(tokenInfo[0].authToken, process.env.JWT_KEY , (err, user) => {
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
  //console.log("check tokenInfo", decodedToken)
  return res.json({tokenInfo: tokenInfo[0], expired: false})
})

router.get('/logout/:token', async (req, res) => {
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
