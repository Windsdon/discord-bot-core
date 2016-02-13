var logger = require("winston");
var async = require("async");

module.exports = {
    version: "1.0.1",
    name: "User identifier",
    author: "Windsdon",
    init: WhoisMod
}

function WhoisMod(e, callback) {
    e._disco.addCommandHandler(async.apply(whoisHandler, e), "start");

    e.register.addCommand(["whois"], ["whois.id"], [
        {
            id: "user",
            type: "mention",
            required: true
        }
    ], whoisID, "View user aliases");

    e.register.addCommand(["whois", "set"], ["whois.set"], [
        {
            id: "user",
            type: "mention",
            required: true
        },
        {
            id: "nick",
            type: "string",
            required: false
        }
    ], whoisSet, "Set user alias");

    e.register.addCommand(["whois", "enable"], ["whois.config.enable"], [], whoisEnable, "Enable alias parsing");
    e.register.addCommand(["whois", "disable"], ["whois.config.disable"], [], whoisDisable, "Disable alias parsing");

    callback();
}

// users db:
// uid, name (current name), old: [(previous names)]
// alias db:
// uid, alias OR config, value
function whoisHandler(e, o, callback) {
    var dbUsers = e.db.getDatabase("names");
    var dbAlias = e.db.getDatabase("alias", o.serverID);

    dbUsers.find({
        uid: o.userID
    }, function(err, data) {
        if(err) {
            logger.error(err);
            return;
        }

        if(data.length != 0) {
            if(data[0].old.indexOf(o.user) == -1) {
                // add new alias
                dbUsers.update({ _id: data[0]._id }, {
                    $push: {
                        old: o.user
                    },
                    $set: {
                        name: o.user
                    }
                }, {}, function(err, num) {
                    if(err) {
                        logger.error(err);
                    }
                });
            }
        } else {
            dbUsers.insert({
                uid: o.userID,
                name: o.user,
                old: [o.user]
            }, function(err, data) {
                if(err) {
                    logger.error(err);
                    return;
                }
            });
        }
    });


    // parse aliases
    dbAlias.find({
        config: "enable"
    }, function(err, data) {
        if(err) {
            logger.error(err);
            return;
        }

        if(data.length == 0 || !data[0].value) {
            return;
        }

        var list = o.message.match(/!!\w+/gi);

        if(!list) {
            return;
        }

        var str = "";

        async.forEachOf(list, function(v, i, cb) {
            dbAlias.find({
                alias: v.substring(2)
            }, function(err, data) {
                if(err) {
                    logger.error(err);
                    cb(); //ignore errors
                    return;
                }
                if(data.length != 0) {
                    str += `**${data[0].alias}**: <@${data[0].uid}>\n`;
                } else {
                    str += `**${v.substring(2)}**: *invalid*\n`;
                }
                cb();
            });
        }, function(err) {
            if(!err) {
                e._disco.queueMessage(o.channelID, str);
            }
        })
    })

    callback(null);
}

function whoisID(e, args) {
    var dbAlias = e.db.getDatabase("alias", e.serverID);
    var dbUsers = e.db.getDatabase("names");

    var str = "";

    //get alias
    dbUsers.find({
        uid: args.user
    }, function(err, data) {
        if(err) {
            e.mention().text("This didn't work:\n").code(err.message).respond();
            return;
        }

        if(data.length == 0) {
            logger.debug("No info for user!");
            e.mention().respond("I have no info on this person");
            return;
        }

        var d = data[0];

        str += "**Username:** " + d.name + "\n";
        str += "**UID:** " + d.uid + "\n";
        str += "**Previous names:** " + d.old.join(", ") + "\n";

        dbAlias.find({
            uid: d.uid
        }, function(err, data) {
            if(err) {
                e.mention().text("This didn't work:\n").code(err.message).respond();
                return;
            }
            if(data.length != 0) {
                str += "**Alias:** " + data[0].alias
            }

            e.mention().n().respond(str);
        });
    })
}

function whoisSet(e, args) {
    var dbAlias = e.db.getDatabase("alias", e.serverID);
    dbAlias.ensureIndex({ fieldName: 'alias', unique: true });
    dbAlias.ensureIndex({ fieldName: 'uid', unique: true });

    if(!args.nick) {
        dbAlias.remove({
            uid: args.user
        });
        e.mention().text("Removed nick from ").mention(args.user).respond();
        return;
    }

    dbAlias.update({
        uid: args.user
    }, {
        uid: args.user,
        alias: args.nick
    }, { upsert: true }, function(err, numReplaced, upsert) {
        e.mention().text("Set ").mention(args.user).respond("to: `" + args.nick + "`");
    });
}

function whoisEnable(e, args) {
    var dbAlias = e.db.getDatabase("alias", e.serverID);

    _whoisSetEnable(dbAlias, true, function (err, numReplaced, upsert) {
        if(err) {
            logger.error(err);
        } else {
            e.mention().respond("Enabled alias parsing");
        }
    });
}

function whoisDisable(e, args) {
    var dbAlias = e.db.getDatabase("alias", e.serverID);

    _whoisSetEnable(dbAlias, false, function (err, numReplaced, upsert) {
        if(err) {
            logger.error(err);
        } else {
            e.mention().respond("Disabled alias parsing");
        }
    });
}

function _whoisSetEnable(db, value, cb) {
    db.update({
        config: "enable"
    }, {
        $set: {
            value: value
        }
    }, { upsert: true }, cb);
}
