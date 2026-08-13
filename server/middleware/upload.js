const multer = require("multer");
const path = require("path");
const { UPLOAD_DIR } = require("../utils/sanitize");

// Storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },

    filename: function (req, file, cb) {

        const uniqueName =
            Date.now() + path.extname(file.originalname);

        cb(null, uniqueName);

    }

});

const fileFilter = (req,file,cb)=>{

    const allowed = [

        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/webp",

        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/webm"

    ];

    if(allowed.includes(file.mimetype)){

        cb(null,true);

    }else{

        cb(new Error("Only images and videos are allowed"));

    }

};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 300 * 1024 * 1024 // 300MB
    }
});

module.exports = upload;