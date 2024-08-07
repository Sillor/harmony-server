# Harmony

This is the server repo for the Harmony app built for Bay Valley Tech.

## Installation

1. Clone the repo
2. Run `npm install`
3. Run `npm start`
4. Setup [client](https://github.com/Sillor/harmony-client)

## Environment Variables

- If maintaining this project, copy contents of `.env.example` to a new file named `.env`. Don't delete `.env.example`

- Otherwise, you can rename `.env.example` to `.env` or follow the previous option.

```py
# The key used to sign the JWT
# 256 bit random string
JWT_KEY=

# The port you want the server to run on
SERVER_PORT=
# The port the client is running on
CLIENT_PORT=

# vercel postgres database
POSTGRES_URL=
```

## Vercel

### Database
1. Navigate to "Storage" on your [Vercel Dashboard](https://vercel.com/dashboard)
2. Create a new Postgres database (or use an existing one)
3. Save the `POSTGRES_URL` variable in the ".env.local" tab to your `.env` file
4. Run `npm run migrate`


## Calendar

The calendar features work using the Google Calendar API. The Harmony Client will talk to the Harmony Server, which contacts the Google API to request or submit calendar event data. In order for this to happen, the Harmony Server directory must contain two files: 'credentials.json' and 'token.json' in the Calendar directory.
  - credentials.json
    - This file was generated upon setting up the Google Cloud Console and enabling the Google Calendar API. It contains the client ID, client secret, and other necessary information for the Harmony Server to interact with Google APIs.
  - token.json
    - When you first attempt to use the Google Calendar API, the Harmony Server must gain authorization to access the Google Calendars stored in the associated Google account. This involves directing the user to a Google authorization URL where they can log in and grant permissions. Upon successful authorization, an access token is saved and used for subsequent API calls to authenticate the user without requiring them to log in again.

Refer to this link for further information regarding the Google Calendar API:
 - https://developers.google.com/calendar/api/quickstart/nodejs

Refer to the Discord 'Server and API thread' for the Google account credentials if you wish to use the existing Google Account associated with this project. Otherwise, you may configure another Google account properly and generate your own credentials and token JSON files.


## Future

- Team ownership transfer
- Team chat
  - load in sections using query params