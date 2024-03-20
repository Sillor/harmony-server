const express = require('express');
const cors = require('cors')
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
require('dotenv').config();
const cloudinary = require('../cloudinary/cloudinary')

const port = process.env.SERVER_PORT;

const app = express();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

app.use(async function (req, res, next) {
    try {
        req.db = await pool.getConnection();
        req.db.connection.config.namedPlaceholders = true;

        await req.db.query(`SET SESSION sql_mode = "TRADITIONAL"`);
        await req.db.query(`SET time_zone = '-8:00'`);

        await next();

        req.db.release();
    } catch (err) {
        console.log(err);

        if (req.db) req.db.release();
        throw err;
    }
});

app.use(express.json());
app.use(cookieParser())
app.use(cors({
    origin: `http://localhost:${process.env.CLIENT_PORT}`,
    credentials: true,
}));


app.use((req, res, next) => {
    res.secureCookie = (name, val, options = {}) => {
        res.cookie(name, val, {
            sameSite: "strict",
            httpOnly: true,
            secure: true,
            ...options,
        });
    };
    next();
});

//Endpoints

//Register User
app.post("/registerUser",
    async function (req, res) {
        try {
            // Duplicate Email Check
            const dupeCheckEmail = req.body.email;

            const [testDupes] = await req.db.query(
                `SELECT * FROM users WHERE email = :dupeCheckEmail AND deleted = 0;`, {
                dupeCheckEmail,
            })

            if (testDupes.length) {
                res.status(409).json({ "success": false, "message": "Email already in use" });
                return
            }

            // Password Encryption
            const hashPW = await bcrypt.hash(req.body.password, 10);
            const user = { "email": req.body.email, "securePassword": hashPW };

            //Create a personal call link/key
            const linkUID = Array.from(Array(254), () => Math.floor(Math.random() * 36).toString(36)).join('')
            const hashedLinkHead = await bcrypt.hash(req.body.email, 10)
            const calllink = `${hashedLinkHead}/${linkUID}`

            // Inserting new user into db
            await req.db.query('INSERT INTO users (email, password, username , userCallLink , profileURL , deleted) VALUES (:email, :password, :email , :calllink , "" , false)', {
                email: user.email,
                password: user.securePassword,
                calllink: calllink
            });

            const accessToken = jwt.sign(user, process.env.JWT_KEY);

            res.secureCookie("token", accessToken);
            
            res.status(201).json({ "success": true })
        } catch (error) {
            console.log(error);
            res.status(500).send("An error has occurred");
        }
    }
);

//Login User
app.post("/loginUser",
    async function (req, res) {
        try {
            // Find User in DB
            const [[user]] = await req.db.query('SELECT * FROM users WHERE email = :email AND deleted = 0', { email: req.body.email });

            // Password Validation
            //const compare = user && validatePassword(req.body.password) && await bcrypt.compare(req.body.password, user.securePassword);
            const compare = user && await bcrypt.compare(req.body.password, user.password);

            if (!compare) {
                res.status(401).json({ "success": false, "message": "Incorrect username or password." });
                return;
            }

            const accessToken = jwt.sign({ "email": user.email, "securePassword": user.password }, process.env.JWT_KEY);

            res.secureCookie("token", accessToken)

            res.status(200).json({ "success": true })
        } catch (error) {
            console.log(error);
            res.status(500).send("An error has occurred");
        }
    }
);

//Private Endpoints
//Authorize JWT
function authenticateToken(req, res, next) {
    const token = req.cookies.token
    if (token == null) { return res.sendStatus(401) };
  
    jwt.verify(token, process.env.JWT_KEY, (err, user) => {
      if (err) { console.log(err); return res.sendStatus(403) }
      req.user = user;
      next()
    })
  }
  
  app.use(authenticateToken);

//Delete User
app.post("/deleteUser",
    async function (req, res) {
        try {
            const userID = await findUID(req.user, req);

            //remove all user links
            await req.db.query(`
            UPDATE userLinks
            SET deleted = true
            WHERE userID1 = :id OR usedID2 = :id AND deleted = false`,
            {
                id : userID
            })

            //remove all teams links
            await req.db.query(`
            UPDATE teamsLinks
            SET deleted = true
            WHERE addUser = :id AND deleted = false`,
            {
                id : userID
            })

            //

            await req.db.query(`
            UPDATE users
            SET deleted = true
            WHERE email = :email AND deleted = false
            `,
                {
                    email : req.user.email
                }
            );
            res.status(200).json({ "success": true })
        } catch (error) {
            console.log(error);
            res.status(500).send("An error has occurred");
        }
    }
);

//Update Username
app.post("/updateUsername",
    async function (req, res) {
        try {
            await req.db.query(`
            UPDATE users
            SET username = :username
            WHERE email = :email
            `,
                {
                    email : req.user.email,
                    username : req.body.newUsername
                }
            );
            res.status(200).json({ "success": true })
        } catch (error) {
            console.log(error);
            res.status(500).send("An error has occurred");
        }
    }
);

// Upload or update user avatar
app.post("/uploadAvatar", async (req, res) => {
  try {
    const { image, avatarLink } = req.body;
    const { email } = req.user;
    
    uploadOptions = {
      upload_preset: "unsigned_upload",
      allowed_formats: ["png", "jpg", "jpeg", "svg", "ico", "jfif", "webp"],
    };

    // Add public ID to 'uploadOptions' if 'avatarLink' exists
    if (avatarLink) {
      // Find the index of the substring 'user-avatar/'
      const startIndex =
        avatarLink.indexOf("user-avatar/") + "user-avatar/".length;

      // Find the index of the end of the substring before the file extension
      const endIndex = avatarLink.lastIndexOf(".");

      // Extract id from 'avatarLink'
      const publicId = avatarLink.substring(startIndex, endIndex);

      uploadOptions.public_id = publicId;
    }

    // Upload image to cloudinary
    const uploadedImage = await cloudinary.uploader.upload(
      image,
      uploadOptions,
      function (error, result) {
        if (error) {
          console.log(error);
        }
        console.log(result);
      }
    );

    // Store avatar URL to database
    await req.db.query(
      `
        UPDATE users
        SET profileURL = :newPFP
        WHERE email = :email
        `,
      {
        email,
        newPFP: uploadedImage.secure_url,
      }
    );

    console.log(uploadedImage);
    res.status(200).json({ success: true, data: uploadedImage });
  } catch (error) {
    console.log(error);
    res.status(500).send("An error has occurred");
  }
});

// Delete user avatar
app.delete("/deleteAvatar", async (req, res) => {
  try {
    const { avatarLink } = req.body;
    const { email } = req.user;
    
    if (avatarLink) {
      // Find the index of the substring 'user-avatar/'
      const startIndex = avatarLink.indexOf("user-avatar/");

      // Find the index of the end of the substring before the file extension
      const endIndex = avatarLink.lastIndexOf(".");

      // Extract public id from 'avatarLink'
      const publicId = avatarLink.substring(startIndex, endIndex);

      // Delete image from Cloudinary
      cloudinary.uploader.destroy(publicId, { invalidate: true });

      // Delete image link from database
      await req.db.query(
        `
          UPDATE users
          SET profileURL = ""
          WHERE email = :email
        `,
        {
          email
        }
      );  
    }

    res.status(200).json({ success: true, message: "Avatar deleted" });
  } catch (error) {
    console.log(error);
    res.status(500).send("An error has occurred");
  }
});

//Functions
function validatePassword(password) {
    const lengthCheck = password.length >= 12;
    const specialCheck = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);
    const forbiddenList = ['password', '123', '1234', '12345', '123456'];
    const forbiddenCheck = !forbiddenList.includes(password.toLowerCase());

    return lengthCheck && specialCheck && forbiddenCheck;
}

//retrieves users id from the stored cookie
async function findUID(userObj, req) {
    const [[queriedUser]] = await req.db.query(
        `SELECT * FROM users WHERE email = :userEmail AND password = :userPW AND deleted = 0`,
        {
            "userEmail": userObj.email,
            "userPW": userObj.securePassword
        }
    );
    return queriedUser.id
}

//Listener

app.listen(port, () => console.log(`Server listening on http://localhost:${process.env.SERVER_PORT}`));