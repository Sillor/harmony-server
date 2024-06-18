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

# mysql database
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
```

## Future Plans

- Team ownership transfer
- Calendar
- Team chat
  - load in sections using query params
