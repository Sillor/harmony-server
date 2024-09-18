require("dotenv").config()
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cookieSession = require('cookie-session');

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'http://localhost:3000/auth/google/callback');

router.use(cookieSession({
  name: 'session',
  keys: ['your-secret-key'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

router.get('/auth/google', (req, res) => {
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email']
  });
  res.redirect(url);
});

router.get('/auth/google/callback', async (req, res) => {
  const { tokens } = await client.getToken(req.query.code);
  client.setCredentials(tokens);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
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
