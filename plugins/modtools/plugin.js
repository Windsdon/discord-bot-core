var logger = require("winston");
var async = require("async");

module.exports = {
    version: "0.1.0",
    name: "Mod Tools",
    author: "Windsdon",
    init: ModtoolsMod
}

function ModtoolsMod(e, callback) {
    var rainbow = new Promise(async.apply(require("./lib/rainbow.js"), e));
    rainbow.then(() => {
        callback()
    });
}
