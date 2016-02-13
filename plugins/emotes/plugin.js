var logger = require("winston");
var async = require("async");
var fs = require("fs");
var request = require("request");

module.exports = {
    version: "1.0.1",
    name: "Emotes",
    author: "Windsdon",
    init: EmoteMod
}

function EmoteMod(e, callback) {
    e._disco.addCommandHandler(async.apply(emotesHandler, e), "start");

    e.register.addCommand(["emote", "add"], ["emote.config.add"], [
        {
            id: "id",
            type: "string",
            required: true
        },
        {
            id: "url",
            type: "string",
            required: true
        }
    ], emoteAdd, "Add a new emote");

    e.register.addCommand(["emote", "remove"], ["emote.config.remove"], [
        {
            id: "id",
            type: "string",
            required: true
        }
    ], emoteRemove, "Remove an emote");

    e.register.addCommand(["emote"], ["emote.list"], [], emoteList, "List emotes");

    e.register.addCommand(["emote", "enable"], ["emote.config.enable"], [], emoteEnable, "Enable emote parsing");
    e.register.addCommand(["emote", "disable"], ["emote.config.disable"], [], emoteDisable, "Disable emote parsing");

    callback();
}

// emotes db:
// id, filename OR config, value
function emotesHandler(e, o, callback) {
    var dbEmotes = e.db.getDatabase("emotes", o.serverID);
    var path = e.db.getStoragePath("emotes", o.serverID);

    // parse aliases
    dbEmotes.find({
        config: "enable"
    }, function(err, data) {
        if(err) {
            logger.error(err);
            return;
        }

        if(data.length == 0 || !data[0].value) {
            return;
        }

        var list = o.message.match(/:\w+:/gi);

        if(!list) {
            return;
        }

        var files = [];
        var msgEmotes = [];

        async.forEachOf(list, function(v, i, cb) {
            dbEmotes.find({
                id: v.substring(1, v.length - 1)
            }, function(err, data) {
                if(err) {
                    logger.error(err);
                    cb(); //ignore errors
                    return;
                }
                if(data.length != 0) {
                    if(msgEmotes.indexOf(data[0].id) == -1) {
                        msgEmotes.push(data[0].id);
                        try {
                            var f = fs.createReadStream(path + "/" + data[0].filename);
                            files.push(f);
                        } catch(err) {
                            logger.error(err);
                        }
                    }
                }
                cb();
            });
        }, function(err) {
            if(!err) {
                files.forEach(function(v) {
                    e._disco.queueFile(o.channelID, v);
                });
            }
        });
    });

    callback(null);
}

function emoteAdd(e, args) {
    var dbEmotes = e.db.getDatabase("emotes", e.serverID);
    dbEmotes.ensureIndex({ fieldName: 'id', unique: true });

    var path = e.db.getStoragePath("emotes", e.serverID);
    var ext = "png";
    if(/\.gif$/.test(args.url)) {
        ext = "gif";
    } else if(/\.jpg$/.test(args.url)) {
        ext = "jpg";
    }
    var fname = args.id + "." + ext;
    var fpath = path + "/" + fname;
    var stream = request(args.url).on('response', function(response) {
        if(response.statusCode != 200) {
            e.mention().respond("That link is invalid - Status Code: " + response.statusCode);
        }
    }).on('error', function(err) {
        logger.error(err);
        e.code(err.message);
    }).pipe(fs.createWriteStream(fpath)).on('finish', function () {
        dbEmotes.update({
            uid: args.user
        }, {
            id: args.id,
            filename: fname
        }, { upsert: true }, function(err, numReplaced, upsert) {
            e.mention().respond("Emote added!");
        });
    });
}

function emoteRemove(e, args) {
    var dbEmotes = e.db.getDatabase("emotes", e.serverID);
    dbEmotes.remove({
        id: args.id
    },{}, function(err, numRemoved) {
        e.mention().respond("Emote removed!");
    });
}

function emoteList(e, args) {
    var dbEmotes = e.db.getDatabase("emotes", e.serverID);
    dbEmotes.find({
        id: {
            $exists: true
        }
    }, function(err, data) {
        if(err) {
            logger.error(err);
            e.code(err.message).respond();
            return;
        }
        if(data.length == 0) {
            e.mention().respond("No emotes here!");
            return;
        }

        var list = [];
        data.forEach(function(v, i) {
            list.push(v.id);
        });

        e.respond("**List of emotes**\n" + list.join(", "));
    });
}

function emoteEnable(e, args) {
    var dbAlias = e.db.getDatabase("emotes", e.serverID);

    _emoteSetEnable(dbAlias, true, function (err, numReplaced, upsert) {
        if(err) {
            logger.error(err);
        } else {
            e.mention().respond("Enabled emote parsing");
        }
    });
}

function emoteDisable(e, args) {
    var dbAlias = e.db.getDatabase("emotes", e.serverID);

    _emoteSetEnable(dbAlias, false, function (err, numReplaced, upsert) {
        if(err) {
            logger.error(err);
        } else {
            e.mention().respond("Disabled emote parsing");
        }
    });
}

function _emoteSetEnable(db, value, cb) {
    db.update({
        config: "enable"
    }, {
        $set: {
            value: value
        }
    }, { upsert: true }, cb);
}
