const express = require('express');
const cors = require('cors')
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const fs = require('fs');
const UserFileShareRoute = require('../user-to-user-fileshare/userFileShare')
const cloudinary = require('../cloudinary/cloudinary')

require('dotenv').config();

const calendarRoutes = require('../Calendar/calendarRoutes');

const port = process.env.SERVER_PORT;

const app = express();

app.use('/api/calendar', calendarRoutes);

app.use(express.json());
app.use(cookieParser())
app.use(cors({
    origin: `http://localhost:${process.env.CLIENT_PORT}`,
    credentials: true,
  }));
  
app.use('/files', UserFileShareRoute)

app.get("/", (req, res) => {
  res.send("Server is functioning properly.")
})


app.listen(port, () => console.log(`Server listening on http://localhost:${process.env.SERVER_PORT}`));




