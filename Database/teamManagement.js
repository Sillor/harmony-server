const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const router = express.Router()

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

router.use(async function (req, res, next) {
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

router.use(express.json());
router.use(cookieParser());
router.use(
    cors({
        origin: `http://localhost:${process.env.CLIENT_PORT}`,
        credentials: true,
    })
);

router.use((req, res, next) => {
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

function authenticateToken(req, res, next) {
    const token = req.cookies.token;
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

router.use(authenticateToken);

//Endpoints

//Create Team
router.post("/createTeam", async function (req, res) {
    try {
        const UID = Array.from(Array(254), () => Math.floor(Math.random() * 36).toString(36)).join('');
        const UserID = await findUID(req.user, req);
        const linkedName = req.body.teamName.toLowerCase().replaceAll(" ", "-");
        const teamName = req.body.teamName;

        //Optional: Create a duplicate uid prevention function

        await req.db.query(
            `INSERT INTO teams (uid , ownerID , teamCallLink , name , deleted)
            VALUES (:uid , :ownerID , :callLink , :name , false);`,
            {
                uid: UID,
                ownerID: UserID,
                callLink: `${linkedName}/${UID}`,
                name: teamName
            }
        );

        const teamID = await findTeamID(UID, teamName, req);

        await req.db.query(
            `INSERT INTO teamsLinks(teamID , addUser , deleted) 
            VALUES(:teamID , :addUser , false);`,
            {
                teamID: teamID,
                addUser: UserID
            }
        )

        res.status(200).json({ "success": true })
    } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
    }
})

//Add Team Link
router.post("/addToTeam", async function (req, res) {
    try {
        const userID = await findUID(req.user, req);
        const targetID = await findTargetUID(req.body.targetEmail, req);
        const teamID = await findTeamID(req.body.teamUID, req.body.teamName, req);

        //optional : create a duplicate checker

        await req.db.query(
            `INSERT INTO teamsLinks(teamID , addUser , deleted) 
            VALUES(:teamID , :addUser , false);`,
            {
                addUser: targetID,
                teamID: teamID
            }
        )
        res.status(200).json({ "success": true })
    } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
    }
})

//Load Team List
router.get("/loadJoinedTeams", async function (req, res) {
    try {

        const userID = await findUID(req.user, req);

        //get all owned teams
        const [ownedTeamsArr] = await req.db.query(
            `SELECT uid , name , teamCallLink FROM teams WHERE OwnerID = :ownerID AND deleted = false`,
            {
                ownerID: userID
            }
        );

        ownedTeamsArr.forEach(element => {
            element.owned = true
        });

        //get all joined teams
        const [joinedTeamsArr] = await req.db.query(
            ` SELECT teams.name , teams.uid , teams.teamCallLink from teamslinks left join teams on teamslinks.teamID = teams.ID WHERE teamslinks.addUser = :addUser and teamslinks.deleted = false`,
            {
                addUser: userID
            }
        );

        joinedTeamsArr.forEach(element => {
            element.owned = false
        });

        //extract ids from ownedTeamArr
        const ownedTeamsIdArr = ownedTeamsArr.map(team => team.uid);

        //filter joined teams to avoid duplicates from owned teams
        const filteredJoinedTeamsArr = joinedTeamsArr.filter(team => !ownedTeamsIdArr.includes(team.uid));

        //append teams together
        const teamList = [...ownedTeamsArr, ...filteredJoinedTeamsArr]

        res.status(200).json({ "success": true, "data": teamList })
    } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
    }
})

//Remove Team Link
router.post("/removeTeamLink", async function (req, res) {
    try {
        const userID = await findUID(req.user, req);
        const isOwner = await verifyTeamOwner(req.body.teamUID, userID, req)
        if (!isOwner) {
            res.status(400).json({ "success": false, "message": "User is not Owner" })
            return
        }

        const targetID = await findTargetUID(req.body.targetEmail, req)
        const teamID = await findTeamID(req.body.teamUID, req.body.teamName, req)
        await req.db.query(`
        UPDATE teamslinks
        SET deleted = true
        WHERE addUser = :addUser AND teamID = :teamID AND deleted = false`,
            {
                "addUser": targetID,
                "teamID": teamID
            })

        res.status(200).json({ "success": true })
    } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
    }
})

//Leave Team
router.post("/leaveTeam", async function (req, res) {
    try {
        const userID = await findUID(req.user, req);
        const teamID = await findTeamID(req.body.teamUID, req.body.teamName, req);
        const ownerCheck = await verifyTeamOwner(req.body.teamUID, userID, req);

        if (ownerCheck) {
            res.status(400).json({ "success": false, "message": "Owner cannot remove self. Please transfer ownership or use Delete Team" });
            return
        }

        await req.db.query(`
        UPDATE teamslinks
        SET deleted = true
        WHERE addUser = :userID AND teamID = :teamID`,
            {
                "userID": userID,
                "teamID": teamID
            });

        res.status(200).json({ "success": true })
    } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
    }

})

//Update Team Name
router.post("/updateTeamName", async function (req, res) {
    try {
        const userID = await findUID(req.user, req);
        const ownerCheck = await verifyTeamOwner(req.body.teamUID, userID, req);
        const teamID = await findTeamID(req.body.teamUID, req.body.teamNameOld, req);

        if (!ownerCheck) {
            res.status(400).json({ "success": false, "message": "Only the owner of a team may change its name" })
            return
        }

        await req.db.query(`
        UPDATE teams
        SET name = :newName
        WHERE ID = :teamID AND UID = :UID AND ownerID = :ownerID AND deleted = false`,
            {
                newName: req.body.teamNameNew,
                ownerID: userID,
                UID: req.body.teamUID,
                teamID: teamID
            })

        res.status(200).json({ "success": true })
    } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
    }
})

//Delete Team
router.post("/deleteTeam", async function (req, res) {
    try {
        const userID = await findUID(req.user, req);
        const ownerCheck = await verifyTeamOwner(req.body.teamUID, userID, req);
        const teamID = await findTeamID(req.body.teamUID, req.body.teamName, req);

        if (!ownerCheck) {
            res.status(400).json({ "success": false, "message": "Only the owner of a team may delete it" })
            return
        }

        //remove team links
        await req.db.query(`
        UPDATE teamslinks
        SET deleted = true
        WHERE teamID = :teamID AND deleted = false`,
            {
                teamID: teamID
            })

        //delete team
        await req.db.query(
            `UPDATE teams
            SET deleted = true
            WHERE id = :teamID AND deleted = false`,
            {
                teamID: teamID
            }
        )

        res.status(200).json({ "success": true })
    } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
    }
})

router.post("/loadTeamMemberList", async function (req, res) {
    try {
        const teamID = await findTeamID(req.body.teamUID, req.body.teamName, req)

        const [membersList] = await req.db.query(
            `SELECT users.username , users.email FROM teamslinks LEFT JOIN users ON teamslinks.addUser = users.id WHERE teamslinks.teamID = :teamID AND teamslinks.deleted = false`
            ,
            {
                teamID : teamID
            }
        );

        const [ownerList] = await req.db.query(
            `SELECT users.username , users.email FROM teams LEFT JOIN users ON teams.ownerID = users.id WHERE teams.id = :teamID and users.deleted = false`
            ,
            {
                teamID : teamID
            }
        );

        //filter membersList to avoid duplicates from ownerList
        const filteredMembersList = membersList.filter(member => 
            !ownerList.some(owner => owner.username === member.username && owner.email === member.email)
        );

        const membersListFinal = filteredMembersList.map((entry) => {return {...entry, owner : false}});
        const ownerListFinal = ownerList.map((entry) => {return {...entry, owner : true}});
        const finalList = [...membersListFinal , ...ownerListFinal];

        res.status(200).json({ "success": true , "data" : finalList})
    } catch (error) {
        console.log(error);
        res.status(500).json({ "success": false, "message": "An error has occurred" });
    }
})

//Functions
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

//finds a target id from an email
async function findTargetUID(targetEmail, req) {
    const [[queriedUser]] = await req.db.query(
        `SELECT * FROM users WHERE email = :userEmail AND deleted = 0`,
        {
            "userEmail": targetEmail,
        }
    );
    return queriedUser.id
}

//finds team id from uid
async function findTeamID(teamUID, teamName, req) {
    const [[queriedTeam]] = await req.db.query(
        `SELECT * FROM teams WHERE uid = :uid and name = :teamName`,
        {
            uid: teamUID,
            teamName: teamName
        }
    );
    return queriedTeam.id
}

//checks if user is the owner of the team, outputs true or false
async function verifyTeamOwner(teamUID, userID, req) {
    const [queryList] = await req.db.query(`
    SELECT * FROM teams where uid = :uid AND ownerID = :ownerID AND deleted = false`,
        {
            uid: teamUID,
            ownerID: userID
        })

    if (queryList.length) {
        return true
    }
    else {
        return false
    }
}


//router
module.exports = router
