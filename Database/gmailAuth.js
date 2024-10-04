const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cookieSession = require('cookie-session');
const { db,tables } = require("./db.js")

require("dotenv").config()
const router = express.Router();
const client = new OAuth2Client(
  process.env.GOOGLE_OAUTH_CLIENT, 
  process.env.GOOGLE_OAUTH_SECRET, 
  'http://localhost:5000/api/auth/google/callback'
);

/*
Need to create token table and credentials table to store tokens and credentials
When a user registers, assign token to user 
When a user logs in, assign credentials to cookie session

Need queries
1. add token and credentials
2. obtain token and credentials
3. delete token and credentials

Will need to compare token of acct signing in
Will need to compare credentials of http cookie to db
*/

router.use(cookieSession({
  name: 'session',
  keys: ['your-secret-key'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

//send to consent window
router.get('/consent-window', (req, res) => {
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email']
  });

  //console.log(client, client.endpoints.tokenInfoUrl, client.endpoints.oauth2TokenUrl)
  return res.json({url});
});

//
router.get('/callback', async (req, res) => {
  try{
    console.log("callback")
  const { tokens } = await client.getToken(req.query.code);
  console.log("token check", tokens, client, typeof tokens.access_token)
  client.setCredentials(tokens);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();

  await db.insert('gmailOAuth').values({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expiry_date: tokens.expiry_date, 
  });

  req.session.user = payload;
  res.redirect('http://localhost:5173/dashboard');
  
} catch(error){
  console.log("error callback", error)
}
});

router.get('/logout', async (req, res) => {
  if (req.session.user) {
      const token = client.credentials.access_token;
      const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
      response.then(() => {
        req.session = null;
        res.redirect('/');
      })
      response.catch((x) => {
        console.error('Error revoking token:', error);
        res.status(500).send('Logout failed');
      })
  } else {
    res.redirect('/');
  }
});

router.get('/', (req, res) => {
  res.send(req.session.user ? `Hello, ${req.session.user.name}` : 'Hello, Guest');
});

module.exports = router