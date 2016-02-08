var logger = require("winston");

module.exports = {
    version: "1.0.0",
    name: "Ciphers",
    author: "Windsdon",
    init: Ciphers
}

function Ciphers(e, callback) {
    e.register.addCommand(["cipher", "rot"], ["cipher.rot"], [
        {
            id: "text",
            type: "string",
            required: true
        }, {
            id: "n",
            type: "string",
            required: true
        }
    ], rot, "Rotate <text> by <n>. n can be negative.");

    callback();
}

function rot(e, args) {
    var text = args.text.toUpperCase();
    var n = parseInt(args.n, 10);
    var results = "";
    var o = "A".charCodeAt(0);
    var al = 26;
    text.split("").forEach(function(v) {
        if(/^[A-Z]$/.test(v)) {
            v = v.charCodeAt(0);
            v -= o;
            v += n;
            v = Math.abs(v%al);
            v += o;
            v = String.fromCharCode(v);
        }

        results += v;
    });

    e.code(text + "\n" + results).respond();
}
