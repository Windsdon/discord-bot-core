var logger = require("winston");

module.exports = {
    version: "1.0.1",
    name: "NB Commands",
    author: "Windsdon",
    init: NB
}

function NB(e, callback) {
    this.poke = new (require("./lib/poke.js"))(e);
    callback();
}
