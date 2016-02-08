var logger = require("winston");
var CryptoJS = require("crypto-js");

module.exports = {
    version: "1.0.0",
    name: "Misc",
    author: "Windsdon",
    init: MiscMod
}


function MiscMod(e, callback) {
    e.register.addCommand(["size"], ["misc.size"], [
        {
            id: "user",
            type: "mention",
            required: false
        }
    ], size, "Get your size");
    callback();
}

function size(e, args) {
    var subject = args.user || e.userID;
    var hash = CryptoJS.MD5(subject).toString();
    var n = parseInt(hash.substring(5, 9), 16);
    var r = n/32768 - 1;
    var s = Math.abs(15 + r * 5);
    e.respond(e.getName(subject) + " is " + s.toFixed(1) + "cm.");
}
