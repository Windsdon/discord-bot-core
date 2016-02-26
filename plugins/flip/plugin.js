var logger = require("winston");
var async = require("async");

module.exports = {
    version: "1.0.0",
    name: "Flip",
    author: "Windsdon",
    init: FlipMod
}

function FlipMod(e, callback) {
    e.register.addCommand(["flip"], ["flip.flip"], [
        {
            id: "options",
            type: "multistr",
            required: true
        }
    ], flip, "What to do?");

    callback();
}


function flip(e, args) {
    e.mention().respond(args.options[Math.floor(Math.random() * args.options.length)]);
}
