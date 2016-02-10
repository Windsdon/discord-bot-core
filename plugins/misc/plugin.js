var logger = require("winston");
var CryptoJS = require("crypto-js");

module.exports = {
    version: "1.1.0",
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
    e.register.addCommand(["lenny"], ["misc.lenny"], [], lenny, "( ͡° ͜ʖ ͡°)");
    callback();
}

function size(e, args) {
    var subject = args.user || e.userID;
    var hash = CryptoJS.MD5(subject).toString();
    var n = (parseInt(hash.substring(5, 9), 16) * 4) % 0xffff;
    var u = n/32768 - 1; // [-1,1]
    if(Math.abs(u) < 0.001) {
        if(u < 0) {
            u = -0.001;
        } else {
            u = 0.001;
        }
    }
    var r = Math.pow(0.5 - Math.cos(Math.PI * u)/2, 1.5) * (u/Math.abs(u)) * Math.exp(u)/Math.E;
    if(r > 1) {
        r = 1;
    }
    var s = Math.abs(15 + r * 10);
    e.respond(e.getName(subject) + " is **" + s.toFixed(1) + "cm**");
}

function lenny(e, args) {
    e.respond("( ͡° ͜ʖ ͡°)");
}
