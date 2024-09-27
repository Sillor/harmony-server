const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const chatRoutes = require("../Chat/routes");
const calendarRoutes = require('../Calendar/calendarRoutes');
const peerChatRoutes = require('../PeerChat/routes')
const requestRoutes = require('../Database/requests.js');
const teamRoutes = require('../Database/teamManagement.js');
const authRoutes = require('../Database/userAuth.js');
const userUtilsRoutes = require('../Database/userUtilities.js');
const userToUserRoutes = require('../Database/userToUser.js');
const fileRoutes = require("../user-to-user-fileshare/userFileShare")

router.use("/api/users" , authRoutes)

router.use(authenticateToken);

router.use('/api/calendar', calendarRoutes);

router.use("/api/chat", chatRoutes);
router.use("/api/peerchat", peerChatRoutes);

router.use("/api/database" , requestRoutes)
router.use("/api/database" , teamRoutes)
router.use("/api/database" , userToUserRoutes)
router.use("/api/database" , userUtilsRoutes)
router.use("/files", fileRoutes)


function authenticateToken(req, res, next) {
  const value = req.headers.authorization;
  if (!value || !value.startsWith("Bearer ")) {
    return res.sendStatus(401);
  }
  const token = value.slice(7);
  if (token == null) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_KEY, (err, user) => {
    if (err) {
      console.log(err);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

module.exports = router;