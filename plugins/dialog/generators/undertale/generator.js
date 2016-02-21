var Canvas = require('canvas');
var Font = Canvas.Font;
var path = require("path");
var logger = require("winston");
var fs = require("fs")
var Image = Canvas.Image;

module.exports = UndertaleDialogGenerator;

if(!Font) {
    logger.error("No font support!");
}

var characters = {
    papyrus: {
        font: "papyrus",
        spritePath: "/sprites/Papyrus/",
        sprites: {
            "default": "0.png",
            "glasses": "3.png"
        }
    }
}

function getFilePath(name) {
    return path.join(__dirname, name);
}

function UndertaleDialogGenerator(e) {
    this.fonts = {};
    if(Font) {
        this.fonts["papyrus"] = new Font('papyrus', getFilePath('/fonts/Smooth_Papyrus.ttf'));
        this.fonts["determination"] = new Font('determination', getFilePath('/fonts/DTM-Mono.otf'));
    }
    this.exports = {
        characters: Object.keys(characters)
    };
    this.tempPath = e.db.getStoragePath("temp");
}

UndertaleDialogGenerator.prototype.make = function (captures, callback) {
    var cname = captures[0].toLowerCase();
    var params = captures[1] ? captures[1].toLowerCase() : "";
    var text = captures[2];

    if(!characters[cname]) {
        callback(new Error(str + " isn't a valid character"));
        return;
    }

    var c = characters[cname];
    var font = c.font || "determination";
    var spriteName = "default";

    if(params) {
        if(c.sprites[params]) {
            spriteName = params;
        }
    }

    if(!c.sprites[spriteName]) {
        callback(new Error("That sprite is invalid!"));
        return;
    }

    var sprite = getFilePath(c.spritePath + c.sprites[spriteName]);

    try {
        generate(font, sprite, text, this.tempPath, function(err, file) {
            callback(err, file);
        });
    } catch (err) {
        logger.error(err);
        err.silent = true;
        callback(err);
    }

}

/**
* Returns a read stream of the dialog box
* @param font string the font name
* @param sprite string the sprite path
* @param text string the text
* @param callback(err, file), file is a
* @throws if failed to open files
*/
function generate(font, sprite, text, tempPath, callback) {
    var canvas = new Canvas(600, 180);
    var ctx = canvas.getContext('2d');

    ctx.antialias = 'none';
    ctx.patternQuality = 'nearest';
    ctx.filter = 'nearest';

    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect (0, 0, 600, 180);

    ctx.fillStyle = "rgb(255,255,255)";
    ctx.fillRect (5, 5, 590, 170);

    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect (10, 10, 580, 160);

    var spriteImage = fs.readFileSync(sprite);
    var img = new Image();
    img.src = spriteImage;
    ctx.drawImage(img, 10, 10, 160, 160);

    if(!Font) {
        logger.error("No font support!");
        var nofont = fs.readFileSync(getFilePath("/nofont.png"));
        img = new Image();
        img.src = nofont;
        ctx.drawImage(img, 0, 0);
    } else {

    }

    var stream = canvas.pngStream();
    var fname = tempPath + '/' + (new Date()).getTime() + '.png';
    logger.debug(fname);
    var fd = null;
    var out = fs.createWriteStream(fname);

    stream.on('data', function(chunk){
        out.write(chunk);
    });

    stream.on('end', function(){
        out.end();
        logger.debug("Finished saving!");
    });

    out.on('finish', function() {
        callback(null, fs.createReadStream(fname));
    })
}
