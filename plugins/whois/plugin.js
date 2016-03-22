var logger = require("winston");
var async = require("async");

module.exports = {
    version: "1.2.0",
    name: "User identifier",
    author: "Windsdon",
    init: WhoisMod
}

function WhoisMod(e, callback) {
    this._e = e;
    e._disco.addCommandHandler(async.apply(whoisHandler, e), "start");

    e.register.addCommand(["whois"], ["whois.id"], [
        {
            id: "user",
            type: "mention",
            required: false
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
            required: false,
            options: {
                validation: /^\w+$/
            }
        }
    ], whoisSet, "Set user alias");

    e.register.addCommand(["whois", "enable"], ["whois.config.enable"], [], whoisEnable, "Enable alias parsing");
    e.register.addCommand(["whois", "disable"], ["whois.config.disable"], [], whoisDisable, "Disable alias parsing");
    e.register.addCommand(["whois", "fix"], ["whois.fix"], [], whoisFix, "Update all users");

    callback();
}

// users db:
// uid, name (current name), old: [(previous names)]
// alias db:
// uid, alias OR config, value
function whoisHandler(e, o, callback) {
    var dbUsers = e.db.getDatabase("names");
    var dbAlias = e.db.getDatabase("alias", o.serverID);
    callback = callback || () => {};

    dbUsers.find({
        uid: o.userID
    }, function(err, data) {
        if(err) {
            logger.error(err);
            return;
        }

        if(data.length != 0) {
            if(data[0].name != o.user) {
                dbUsers.update({ _id: data[0]._id }, {
                    $set: {
                        name: o.user
                    }
                }, {}, function(err, num) {
                    if(err) {
                        logger.error(err);
                    }
                });
            }
            if(data[0].old.indexOf(o.user) == -1) {
                // add new alias
                dbUsers.update({ _id: data[0]._id }, {
                    $push: {
                        old: o.user
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

    args.user = args.user || e.userID;

    var str = "";

    //get alias
    dbUsers.find({
        uid: args.user
    }, function(err, data) {
        logger.debug(JSON.stringify(data));
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


        str += "**Username:** " + e.clean(d.name) + "\n";
        str += "**UID:** " + d.uid + "\n";
        str += "**Previous names:** " + e.clean(d.old.join(", ")) + "\n\n";
        var mentionedUser = e._disco.bot.servers[e.serverID].members[args.user];
        if(mentionedUser === undefined) {
            str += "**This user is not from this server**\n\n";
            for (var sid in e._disco.bot.servers) {
                if (e._disco.bot.servers.hasOwnProperty(sid)) {
                    if(e._disco.bot.servers[sid].members[args.user]) {
                        mentionedUser = e._disco.bot.servers[sid].members[args.user];
                    }
                }
            }
        }

        if(mentionedUser) {
            try {
                str += `**Discriminator:** ${mentionedUser.user.discriminator}\n`;
                str += `**Avatar URL:** https://cdn.discordapp.com/avatars/${mentionedUser.user.id}/${mentionedUser.user.avatar}.jpg\n`
                str += `**Joined at:** ${new Date(Date.parse(mentionedUser.joined_at))}\n`
                str += `**Current status:** ${mentionedUser.status ? mentionedUser.status: "Offline"}\n`;
                if (mentionedUser.game != null) {
                    str += `**Playing:** ${e.clean(mentionedUser.game.name)}\n`
                }
            } catch(err2) {

            }
        }



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

function whoisFix(e, args) {
    var users = e._disco.pm.getAllUsers();
    var self = this;
    users.forEach(function(v) {
        var user = e._disco.getUser(v);
        if(user) {
            whoisHandler(e.mod._e, {
                userID: user.id,
                user: user.username,
                serverID: e.serverID,
                message: ""
            });
        }
    });

    e.respond("Updated " + users.length + " users");
}
