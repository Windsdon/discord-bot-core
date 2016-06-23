var logger = require("winston");
var async = require("async");
var fs = require('fs');
var MarkovChain = require('markovchain');

module.exports = {
    version: "0.2.0",
    name: "Markov Generator",
    author: "Windsdon",
    init: MarkovMod
}

function MarkovMod(e, callback) {
    e._disco.addCommandHandler(async.apply(markovHandler, e), "start");
    e.register.addCommand(["imitate"], ["markov.imitate"], [
        {
            id: "flags",
            type: "flags",
            options: {
                list: [
                    "size", "bible"
                ]
            }
        },
        {
            id: "user",
            type: "mention",
            required: false
        },
        {
            id: "start",
            type: "string",
            required: false
        }
    ], imitate, "Generate a sentence based on the user's speech pattern", {
        cooldown: 10
    });

    try {
        var path = e.db.getStoragePath("quotes");

        this.bible = new MarkovChain(fs.readFileSync(path + '/bible.txt', 'utf8'), function(word) {
            return word.replace(/[^A-Za-z0-9'çÇÃãÕõÉéóÓÚúÍíáÁ!@#$<>]/gi, '')
        });
    } catch(err) {
    }

    callback();
}

function markovHandler(e, o, callback) {
    var path = e.db.getStoragePath("quotes");
    fs.appendFile(path + "/" + o.userID + '.txt', o.message + "\n", encoding='utf8', function (err) {
        if (err) {
            callback();
            return;
        }
        callback();
    });
}

function imitate(e, args) {
    var path = e.db.getStoragePath("quotes");
    var size = args.flags.size || 10;
    args.user = args.user || e.userID;
    if(size > 30) {
        size = 30;
    }
    try {
        if(args.flags.bible && e.mod.bible) {
            var quotes = e.mod.bible;
        } else {
            var quotes = new MarkovChain(fs.readFileSync(path + "/" + args.user + '.txt', 'utf8'), function(word) {
                return word.replace(/[^A-Za-z0-9'çÇÃãÕõÉéóÓÚúÍíáÁ!@#$<>]/gi, '')
            });
        }

        var txt = "";

        if(args.start) {
            txt = quotes.start(args.start).end(size).process();
        } else {
            txt = quotes.start(function(wordList) {
                var tmpList = Object.keys(wordList);
                return tmpList[~~(Math.random()*tmpList.length)]
            }).end(size).process();
        }

        if(args.flags.bible && e.mod.bible) {
            e.respond(txt + " - *God?*");
        } else {
            e.respond(txt + " - *" + e.getName(args.user) + "*");
        }

    } catch (err) {
        e.mention().respond("I can't generate a sentence for that user!");
    }
}
