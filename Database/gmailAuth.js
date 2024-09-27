require("dotenv").config()
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cookieSession = require('cookie-session');

const router = express.Router();
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID, 
  process.env.GOOGLE_CLIENT_SECRET, 
  'http://localhost:3000/auth/google/callback'
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
router.get('/auth/google', (req, res) => {
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email']
  });
  res.redirect(url);
});

//
router.get('/auth/google/callback', async (req, res) => {
  const { tokens } = await client.getToken(req.query.code);
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
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

router.get('/', (req, res) => {
  res.send(req.session.user ? `Hello, ${req.session.user.name}` : 'Hello, Guest');
});
