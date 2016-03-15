var logger = require("winston");
var async = require("async");
var fs = require('fs');
var MarkovChain = require('markovchain');

module.exports = {
    version: "0.1.0",
    name: "Markov Generator",
    author: "Windsdon",
    init: MarkovMod
}

function MarkovMod(e, callback) {
    e._disco.addCommandHandler(async.apply(markovHandler, e), "start");
    e.register.addCommand(["imitate"], ["markov.imitate"], [
        {
            id: "user",
            type: "mention",
            required: true
        },
        {
            id: "start",
            type: "string",
            required: false
        }
    ], imitate, "Generate a sentence based on the user's speech pattern", {
        cooldown: 10
    });

    callback();
}

function markovHandler(e, o, callback) {
    var path = e.db.getStoragePath("quotes");
    fs.appendFile(path + "/" + o.userID + '.txt', o.message + "\n", encoding='utf8', function (err) {
        if (err) {
            callback(err);
        }
        callback();
    });
}

function imitate(e, args) {
    var path = e.db.getStoragePath("quotes");
    try {
        var quotes = new MarkovChain(fs.readFileSync(path + "/" + args.user + '.txt', 'utf8'), function(word) {
            return word.replace(/[^A-Za-z0-9'çÇÃãÕõÉéóÓÚúÍíáÁ!@#$<>]/gi, '')
        });

        var txt = "";

        if(args.start) {
            txt = quotes.start(args.start).end(10).process();
        } else {
            txt = quotes.start(function(wordList) {
                var tmpList = Object.keys(wordList);
                return tmpList[~~(Math.random()*tmpList.length)]
            }).end(10).process();
        }

        e.respond(txt + " - *" + e.getName(args.user) + "*");

    } catch (err) {
        e.mention().respond("I can't generate a sentence for that user!");
    }
}
