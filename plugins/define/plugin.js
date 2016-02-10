var logger = require("winston");

module.exports = {
    version: "1.0.1",
    name: "Define",
    author: "Windsdon",
    init: DefineMod
}

function DefineMod(e, callback) {
    this.sources = {
        "dicionarioinformal": require("./lib/dicionarioinformal.js")
    };

    e.register.addCommand(["def"], ["define.define"], [
        {
            id: "str",
            type: "string",
            required: true
        }
    ], def, "Define a word or expression");

    e.register.addCommand(["defset", "source"], ["define.set"], [
        {
            id: "value",
            type: "choice",
            options: {
                list: Object.keys(this.sources)
            },
            required: true
        }
    ], defSetSource, "Change the source on this server");

    callback();
}

function defSetSource(e, args) {
    var settings = e.db.getDatabase("settings", e.serverID);

    settings.update({
        id: 'source'
    }, {
        id: 'source',
        value: args.value
    }, { upsert: true }, function (err, numReplaced, upsert) {
        if(!err) {
            if(upsert){
                e.mention().respond("Set source to " + upsert.value);
            } else {
                e.mention().respond("Nothing changed");
            }
        } else {
            logger.error(err);
        }
    });
}

function def(e, args) {
    var settings = e.db.getDatabase("settings", e.serverID);

    logger.debug("Called define with args: " + args.str);

    settings.find({
        id: "source"
    }, function(err, docs) {
        // get the current source
        if(err || docs.length == 0) {
            e.mention().respond("I can't find a source on this server!");
            return;
        }

        //e.mention().respond("Hold on...");
        e.mod.sources[docs[0].value](args.str, function(err, results) {
            if(err) {
                e.mention().respond("Failed to get your definition: " + err.message);
                return;
            }

            e.text("Definition of `" + args.str + "`:\n").respond(results.message);
        });
    })
}
