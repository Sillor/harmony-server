const express = require("express");
const router = express.Router()

router.post("/load", async (req, res) => {
  try {
    const { teamUID, teamName } = req.body;
    const userId = await findUserId(req);
    const {teamId} = await findJoinedTeamId(userId, teamUID, teamName, req);

    if (!teamId) {
      res
        .status(403)
        .json({ success: false, message: "User does not have access to team" });
      return;
    }
    
    const [chats] = await req.db.query(
      `SELECT chats.uid, chats.sentAt, users.username AS sender, chats.message, users.profileURL, chats.isFile, chats.edited
      FROM teamschats AS chats
      JOIN users ON chats.messageUser = users.id
      WHERE chats.teamID = :teamId AND chats.deleted = 0;`,
      {
        teamId: teamId,
      }
    );

    res.json({ success: true, data: chats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "An error has occurred" });
  }
});

router.post("/create", async (req, res) => {
  try {
    const { message, teamUID, teamName } = req.body;
    const uid = Array.from(Array(254), () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join("");
    const userId = await findUserId(req);
    const {teamId} = await findJoinedTeamId(userId, teamUID, teamName, req);

    if (!teamId) {
      console.error("user not in team")
      res
        .status(403)
        .json({ success: false, message: "User does not have access to team" });
      return;
    }

    await req.db.query(
      `INSERT INTO teamschats (uid, teamID, messageUser, message, isFile, edited, deleted)
      VALUES (:uid, :teamId, :userId, :message, 0, 0, 0);`,
      {
        uid,
        teamId,
        userId,
        message,
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error)
    res.status(500).json({ success: false, message: "An error has occurred" });
  }
});

router.post("/edit", async (req, res) => {
  try {
    const { chatUID, teamUID, teamName, message } = req.body;
    const userId = await findUserId(req);
    const {teamId} = await findJoinedTeamId(userId, teamUID, teamName, req);

    if (!teamId) {
      res
        .status(403)
        .json({ success: false, message: "User does not have access to team" });
      return;
    }

    await req.db.query(
      `UPDATE teamschats SET message = :message, edited = 1
      WHERE uid = :uid AND messageUser = :userId AND deleted = false;`,
      {
        message,
        uid: chatUID,
        userId: userId,
      }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "An error has occurred" });
  }
});

router.delete("/delete", async (req, res) => {
  try {
    const { chatUID, teamUID, teamName } = req.body;
    const userId = await findUserId(req);
    const {teamId} = await findJoinedTeamId(userId, teamUID, teamName, req);

    if (!teamId) {
      res
        .status(403)
        .json({ success: false, message: "User does not have access to team" });
      return;
    }

    await req.db.query(
      `UPDATE teamschats SET deleted = 1
      WHERE uid = :uid
      AND teamID = :teamId
      AND (messageUser = :userId OR teamId IN (
        SELECT id FROM teams WHERE ownerID = :userId
      ))
      AND deleted = 0;`,
      {
        uid: chatUID,
        userId,
        teamId
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error)
    res.status(500).json({ success: false, message: "An error has occurred" });
  }
});

//Functions
//retrieves users id from the stored cookie
async function findUserId(req) {
  const [[queriedUser]] = await req.db.query(
    `SELECT * FROM users WHERE email = :userEmail AND password = :userPW AND deleted = 0`,
    {
      userEmail: req.user.email,
      userPW: req.user.securePassword,
    }
  );
  return queriedUser.id;
}

/**
 * finds team id from uid that user is in 
 * @returns {Promise<{teamId?: number, ownerId?: number}>}
 */
async function findJoinedTeamId(userId, teamUID, teamName, req) {
  const [[team]] = await req.db.query(
    `SELECT teamID AS teamId, teams.ownerID as ownerId
    FROM teamslinks
    JOIN teams ON teamslinks.teamID = teams.id
    WHERE ((teamslinks.addUser = :userId OR teams.ownerID = :userId) AND teams.uid = :uid AND teams.name = :teamName)
    AND teams.deleted = false;`,
    {
      userId: userId,
      uid: teamUID,
      teamName: teamName,
    }
  );

  return team || {};
}

module.exports = router