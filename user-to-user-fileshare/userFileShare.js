const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Console } = require('console');

//need to add a remove chat directory for when chats get deleted
// need to use function for GET User id or GET team id
// Set up multer for file uploads
//define destination and filename convention
const uploadDir = path.join(__dirname, '../uploads')

router.use("*", async (req, res, next) => {
  const [, , teamUid] = req.params[0].split("/");
  try {
    const userID = await findUID(req.user, req);

    //check if user owns team
    const [[{ owns }]] = await req.db.query(
      `SELECT COUNT(*) AS owns
        FROM teams
        WHERE uid = :uid
        AND ownerID = :ownerID AND deleted = false;`,
      {
        uid: teamUid,
        ownerID: userID,
      }
    );

    //check if user has joined team
    const [[{ joined }]] = await req.db.query(
      `SELECT COUNT(*) AS joined FROM teamslinks
        LEFT JOIN teams on teamslinks.teamID = teams.ID
        WHERE teamslinks.addUser = :addUser AND teams.uid = :uid AND teamslinks.deleted = false;`,
      {
        uid: teamUid,
        addUser: userID, 
      }
    );

    // send unauthorized if they are neither the owner nor member of the team
    if (!owns && !joined) {
      return res.sendStatus(403)
    }

    next();
  } catch (error) {
    next(new Error("An error occurred"));
  }
});

router.use('*', (req, res, next) => {
    let urlParams = req.params[0].split('/');
    let chatId = urlParams[2];
    req.serverUploadPath = path.join(uploadDir, chatId);
    if (!fs.existsSync(req.serverUploadPath) && urlParams[1] === 'list'){
        fs.mkdirSync(req.serverUploadPath, {recursive: true});
        next();
    }else{
        next();
    }
})
 
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        cb(null, req.serverUploadPath);
    },
    filename: function (req, file, cb) { 
        let cleanName = cleanFileName(file.originalname)
        console.log("thi sis the file name", cleanName, "EXTRNSION",cleanName.extension)
        const uniqueSuffix = Date.now();
        cb(null, cleanName.name+ '-id-'+ uniqueSuffix + '.' + cleanName.extension );
    }
});
const upload = multer({ storage: storage });
 
// File upload route
//NOTE: upload.single must be the same as the input element name property
//e.g. <input type="file" name="file">
//3/21/24 stretch goal - will i need to a multiple file upload endpoint
router.post('/upload/:chatId', upload.single('file'), async (req, res) => {
    try{
        const userID = await findUID(req.user, req)
        const {chatId} = req.params
        let fileNameSplit = req.file.filename.split(/-id-(.*?)\./)
        let fileUid = fileNameSplit[1]

        await req.db.query(
        `INSERT INTO files ( uid, name, ownerID, deleted)
        VALUES ( :uid, :name, ${userID}, false)`,
        {
            uid: fileUid,
            name: req.file.originalname
        }
        );

      /* 
      5/22/24 TypeError: req.socket.to is not a function
      -Lawrence: Not sure what this error is, I commented this part out 
                 so that I could send info to the front end
        req.socket.to("online:" + chatId).emit("update:file_added", {
        team: chatId,
        filename: req.file.originalname,
        user: req.user.username
      });     */  
      
        return res.json({ 'filename': req.file.originalname, 'data': req.file, 'UID': fileUid });
    } catch(err) { 
        console.error(err);
        return
    }
}); 

router.get('/getFileInfo/:chatId/:fileId', async (req, res) => {
    const {fileId} = req.params;
    let getFileName = await req.db.query(
        `SELECT name FROM
        files WHERE 
        files.uid = :fileId;`,
        { fileId }
    )
    let cleanName = cleanFileName(getFileName[0][0]['name'])
    res.json({'fileName': cleanName.name, 'fileExtension': cleanName.extension})
})
 
// File download route
router.get('/download/:chatId/:fileId', async (req, res) => {
    const {chatId, fileId} = req.params; 
    let getFileName = await req.db.query(
        `SELECT name FROM
        files WHERE 
        files.uid = :fileId;`,
        { fileId }
    )
    const {name, extension} = cleanFileName(getFileName[0][0]['name'])
    const filePath = `${uploadDir}/${chatId}/${name}-id-${fileId}.${extension}`;
   
    //query SQL to get file name from file id
    res.download(filePath, 'downloadMe',(err) => {if(err) console.error(err)});
});

//file rename route
router.post('/rename/:chatId/:fileName/:fileId/:fileType', (req, res) => {
    const {chatId, fileName, fileId, fileType} = req.params;
    const newFileName = req.body.newFileName;
    
    const oldFilePath = `${uploadDir}/${chatId}/${fileName}-id-${fileId}.${fileType}`;
    const newFilePath = `${uploadDir}/${chatId}/${newFileName}-id-${fileId}.${fileType}`;
    let chatDir = fs.readdirSync(`${uploadDir}/${chatId}`);
    
    if(chatDir.includes(`${newFileName}.${fileType}`)){
       return res.json({"success": false, "status": 400, "message": `${newFileName} exists`});
    }
    
    fs.rename(oldFilePath, newFilePath, (err) => {
        if (err) throw err;
        return res.json({"success": true, "status": 200, newFileName, "message": `File name changed to ${newFileName}`});
    });
})

//file duplicate route
router.post('/duplicate/:chatId/:fileName/:fileId/:fileType', async (req, res) => {
    const { chatId, fileName, fileId, fileType } = req.params;
    const sourcePath = `${uploadDir}/${chatId}/${fileName}-id-${fileId}.${fileType}`;
    let dirtyFileName = `${fileName}-id-${fileId}.${fileType}`;
    let destPath;
    //regex targets comma, period and square bracket 
    let cleanName = cleanFileName(dirtyFileName);
    //scan directory for files
    let chatDir = fs.readdirSync(`${uploadDir}/${chatId}`);
    //finds amount of file copies in directory
    let fileCopiesArray = chatDir.filter(file => file.match(cleanName.id));
    fileCopiesArray.sort((a, b) =>
    a.localeCompare(b, "en-US", { numeric: true, ignorePunctuation: true })
    ).reverse(); 
    let latestCopy;
    let fileCopyValue; 
    console.log("copying fn/duplicating wwww",fileCopiesArray, cleanName, fileId)
 
    //split filename -id- uid
    if(fileCopiesArray.length === 1){
        //if you click on a root file with no copies
        if(cleanName.copy === -1){
            //if it has no copy number
                destPath = `${uploadDir}/${chatId}/${fileName}-id-${cleanName.id}(1).${fileType}`;
            } else { 
            //if it has a copy number
                fileCopyValue = Number(cleanName.copy) + 1;
                destPath = `${uploadDir}/${chatId}/${fileName}-id-${cleanName.id}(${fileCopyValue}).${fileType}`;
        }
        fs.copyFileSync(sourcePath, destPath) 

    }else if(fileCopiesArray.length >= 2){
        latestCopy = cleanFileName(fileCopiesArray[1]);
        fileCopyValue = Number(latestCopy.copy) + 1;

        if(cleanName.copy === -1){
        //if you click on root file that already has copies
            destPath = `${uploadDir}/${chatId}/${fileName}-id-${cleanName.id}(${fileCopyValue}).${fileType}`;
        } else {
        //if you click on a copy 
            destPath = `${uploadDir}/${chatId}/${fileName}-id-${cleanName.id}(${fileCopyValue}).${fileType}`;
        }
        fs.copyFileSync(sourcePath, destPath)
    }

   /*  req.socket.to("online:" + chatId).emit("update:file_added", {
      team: chatId, 
      filename: fileName,
      user: req.user.username
    }); */

    return res.json({'status': 200, 'message': 'Copy success', 'file': `${fileName}-id-${fileId}${fileCopyValue}.${fileType}`})
})

//file delete route
router.delete('/delete/:chatId/:fileName/:fileId', (req, res) => {
    try{
        const {chatId, fileName, fileId} = req.params;
        const filePath = `${uploadDir}/${chatId}/${fileName}-id-${fileId}.pdf`;
        console.log("filepath", filePath)
        fs.unlinkSync(filePath);

        req.socket.to("online:" + chatId).emit("update:file_removed", {
          team: chatId,
          filename: fileName,
          user: req.user.username
        });
        return res.json({'message': 'success', 'status': 200})

    } catch(err) {
        console.error(`Server Error ${err}`);
        return res.send({'message': `Server Error ${err}`});
    }
})

//get file names route depending on the chatId param
router.get('/list/:chatId', async (req, res) => {
    let fileInfo = {};
    let fileProps = []; 
    let {chatId} =  req.params; 
    
    try{
        let files = fs.readdirSync(`./uploads/${chatId}`, {withFileTypes:true});
        for(let fileName of files){
            let data = fs.statSync(path.join(__dirname, `../uploads/${chatId}/${fileName.name}`));
            fileProps.push(data)
        }
        
        fileInfo = {files, dirName: [`uploads`,`${chatId}`]}
        if(!fileInfo.properties){
            fileInfo = {...fileInfo, properties: fileProps};
        }
        return res.json(fileInfo)
    }catch(err){
        return res.json({'error': `error in server ${err}`})
    } 
    
});


module.exports = router;

/**
 * Parses a file name into its components
 * @param {string} dir
 * @returns {{
 *  name: string,
 *  id: number | null,
 *  copy: number,
 *  extension: string
 * }}
 */
function cleanFileName(dir) {
    if(typeof dir !== 'string'){
        return dir
    }
    if (!dir.includes(".")) {
      return {
        name: dir,
        id: null,
        copy: -1,
        extension: ""
      }
    }                // match(/^([a-zA-Z]+)(-id-)(\d+)(?:\((\d+)\))\.([a-zA-Z0-9]+)$/)
    const match = dir.match(/^([a-zA-Z]+)(-id-)(\d+)(?:\((\d+)\))?\.([a-zA-Z0-9]+)$/)
    
    console.log("file name in clean file naem fn", match, dir)
    const fileName = match[1]
    const fileId = match[3] ? Number(match[3]) : null
    const fileCopy = match[4] ? Number(match[4]) : -1
    const fileExtension = match[5]
    return {
      name: fileName,
      id: fileId,
      copy: fileCopy,
      extension: fileExtension
    }
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
