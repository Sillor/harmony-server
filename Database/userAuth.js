const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const {
  createUser,
  findUser
} = require("./queries/user.js");
require("dotenv").config();
const router = express.Router()

router.use(express.json({ limit: "50mb" }))

router.use(express.json());
router.use(cookieParser())

//Endpoints

/**
 * Register a new user
 * METHOD: POST
 * CREDENTIALS: FALSE
 * BODY: {email: string, username: string, password: string}
 * RESPONSE: {success: boolean, message?: string}
 */
router.post("/registerUser",
    async function (req, res) {
        try {
            // Duplicate Email Check
            const existingUser = await findUser(req.body.email);
            
            if (existingUser) {
              res.status(409).json({ success: false, message: "Email already in use" });
              return;
            }      

            // Password Encryption
            const hashPW = await bcrypt.hash(req.body.password, 10);
            const user = { "email": req.body.email, "username": req.body.username, "securePassword": hashPW };

            //Create a personal call link/key
            const linkUID = Array.from(Array(254), () => Math.floor(Math.random() * 36).toString(36)).join('')
            const hashedLinkHead = await bcrypt.hash(req.body.email, 10)
            const callLink = `${hashedLinkHead}/${linkUID}`

            // Inserting new user into db
            await createUser({
              email: req.body.email,
              username: req.body.username,
              hashedPassword: hashPW,
              userCallLink: callLink,
            });

            const accessToken = jwt.sign(user, process.env.JWT_KEY);

            res.status(201).json({ "success": true, token: accessToken })
        } catch (error) {
            console.log(error);
            res.status(500).json({ "success": false, "message": "An error has occurred" });
        }
    }
);

/**
 * Login a user
 * METHOD: POST
 * CREDENTIALS: FALSE
 * BODY: {email: string, password: string}
 * RESPONSE: {success: boolean, message?: string}
 */
router.post("/loginUser",
    async function (req, res) {
        try {
            // Find User in DB
            const user = await findUser(req.body.email);

            // Password Validation
            //const compare = user && validatePassword(req.body.password) && await bcrypt.compare(req.body.password, user.securePassword);
            const compare = user && await bcrypt.compare(req.body.password, user.password);

            if (!compare) {
                res.status(401).json({ "success": false, "message": "Incorrect username or password." });
                return;
            }

            const accessToken = jwt.sign({ "email": user.email, "username": user.username, "securePassword": user.password }, process.env.JWT_KEY);

            res.status(200).json({ "success": true, token: accessToken})
        } catch (error) {
            console.log(error);
            res.status(500).json({ "success": false, "message": "An error has occurred" });
        }
    }
);

/**
 * Logout a user (clear cookie)
 * METHOD: POST
 * CREDENTIALS: FALSE
 * RESPONSE: {success: boolean, message?: string}
 */
router.post("/logoutUser",
    async function (req, res) {
      try {
        res.status(200).json({ success: true });
      } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
      }
    }
);

//Functions
function validatePassword(password) {
    const lengthCheck = password.length >= 12;
    const specialCheck = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);
    const forbiddenList = ['password', '123', '1234', '12345', '123456'];
    const forbiddenCheck = !forbiddenList.includes(password.toLowerCase());

    return lengthCheck && specialCheck && forbiddenCheck;
}


//router
module.exports = router
