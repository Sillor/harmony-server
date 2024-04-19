const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

//need to add a remove chat directory for when chats get deleted
// need to use function for GET User id or GET team id
// Set up multer for file uploads
//define destination and filename convention
const uploadDir = path.join(__dirname, '../uploads')
router.use('*', (req, res, next) => {
    let urlParams = req.params[0].split('/');
    let chatId = urlParams[2];
    req.serverUploadPath = `${uploadDir}/${chatId}`;
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
        let cleanName = file.originalname.split('.')
        const uniqueSuffix = Date.now();
        cb(null, cleanName[0]+ '-'+ uniqueSuffix + '.' + cleanName[1] );
    }
});
const upload = multer({ storage: storage });
 
// File upload route
//NOTE: upload.single must be the same as the input element name property
//e.g. <input type="file" name="file">
//3/21/24 will i need to a multiple file upload endpoint
router.post('/upload/:chatId', upload.single('file'), (req, res) => {
    try{
      const {chatId} = req.params
      req.socket.to("online:" + chatId).emit("update:file_added", {
        team: chatId,
        filename: req.file.originalname,
        user: req.user.username
      });
        return res.json({ 'filename': req.file.originalname, 'data': req.file });
    } catch(err) { 
        console.error(err);
        return
    }
}); 

// File download route
router.get('/download/:chatId/:fileName', async (req, res) => {
    const {chatId, fileName} = req.params;
    const filePath = `${uploadDir}/${chatId}/${fileName}`;
    res.download(filePath, 'downloadMe',(err) => {if(err) console.error(err)});
});

//file duplicate route
router.post('/:chatId/:fileName', async (req, res) => {
    const { chatId, fileName } = req.params;
    const sourcePath = `${uploadDir}/${chatId}/${fileName}`;
    let destPath;
    //regex targets comma, period and square bracket
    let cleanName = cleanFileName(fileName);
    //scan directory for files
    let chatDir = fs.readdirSync(`${uploadDir}/${chatId}`);
    //finds amount of file copies in directory
    let fileCopiesArray = chatDir.filter(file => file.match(cleanName[0]));  
    fileCopiesArray.sort((a, b) =>
    a.localeCompare(b, "en-US", { numeric: true, ignorePunctuation: true })
    ).reverse();
    let latestCopy;
    let fileCopyValue;

    if(fileCopiesArray.length === 1){
        //if you click on a root file with no copies
        if(cleanName.length === 2){
            //if it has no copy number
                destPath = `${uploadDir}/${chatId}/${cleanName[0]}(1).${cleanName[1]}`;
            } else {
            //if it has a copy number
                fileCopyValue = Number(cleanName[1]) + 1;
                destPath = `${uploadDir}/${chatId}/${cleanName[0]}(${fileCopyValue}).${cleanName[3]}`;
        }
        fs.copyFileSync(sourcePath, destPath)

    }else if(fileCopiesArray.length >= 2){
        latestCopy = cleanFileName(fileCopiesArray[1]);
        fileCopyValue = Number(latestCopy[1]) + 1;

        if(cleanName.length === 2){
        //if you click on root file that already has copies
            destPath = `${uploadDir}/${chatId}/${cleanName[0]}(${fileCopyValue}).${cleanName[1]}`;
        } else {
        //if you click on a copy
            destPath = `${uploadDir}/${chatId}/${cleanName[0]}(${fileCopyValue}).${cleanName[3]}`;
        }
        fs.copyFileSync(sourcePath, destPath)
    }

    req.socket.to("online:" + chatId).emit("update:file_added", {
      team: chatId,
      filename: fileName,
      user: req.user.username
    });

    return res.json({'status': 200, 'message': 'Copy success', 'file': fileName})
})

//file delete route
router.delete('/:chatId?/:fileName', (req, res) => {
    try{
        const {chatId, fileName} = req.params;
        const filePath = `${uploadDir}/${chatId}/${fileName}`;
        
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
 
function cleanFileName(dir){
    if(typeof dir !== 'string'){
        return dir
    }
    return dir.split(/[.()]/g);
}