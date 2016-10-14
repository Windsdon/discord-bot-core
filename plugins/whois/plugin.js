var logger = require("winston");
var async = require("async");

module.exports = {
    version: "1.4.0",
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
            required: false,
            options: {
                multi: true
            }
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
    var u = e._disco.getUser(o.userID, o.serverID);
    try {
        o.nick = u.nick;
    } catch(err) {
        return callback();
    }

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

            var nickResolve = new Promise(
                function(resolve) {
                    if(data[0].nicks) {
                        resolve();
                        return;
                    }
                    dbUsers.update({ _id: data[0]._id }, {
                        $set: {
                            nicks: [o.nick]
                        }
                    }, {}, function(err, num) {
                        if(err) {
                            logger.error(err);
                        }
                        resolve();
                    });
                }
            )

            nickResolve.then(function() {
                dbUsers.find({
                    uid: o.userID
                }, function(err, data) {
                    try {
                        if(o.nick && data[0].nicks.indexOf(o.nick) == -1) {
                            logger.debug("Pushing new nick: " + o.nick);
                            dbUsers.update({ _id: data[0]._id }, {
                                $push: {
                                    nicks: o.nick
                                }
                            }, {}, function(err, num) {
                                if(err) {
                                    logger.error(err);
                                }
                            });
                        }
                    } catch(err) {
                        logger.error(err);
                    }
                })
            });
        } else {
            dbUsers.insert({
                uid: o.userID,
                name: o.user,
                old: [o.user],
                nicks: [o.nick]
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

    if(args.user) {
        if(typeof args.user === "string") {
            return _whois();
        } else if(args.user.length == 1) {
            args.user = args.user[0];
            return _whois();
        } else {
            if(args.user.length > 20) {
                return e.mention().respond("Please be more specific!");
            }
            var list = args.user;
            var l = [];
            for(var i = 0; i < list.length; i++) {
                l.push("" + (i + 1));
            }

            e.text("I found these:\n\n");

            list.forEach(function(v, i) {
                var u = e.getUser(v, e.serverID);
                if(!u) {
                    u = {};
                }
                e.text(`**${i + 1}**: _${u.username}_ ${u.nick ? "(" + u.nick + ")" : ""}\n`);
            });

            e.respond("\n\n**Which one?** Send a message with the number you want more info on.");
            e.expect([
                {
                    id: "i",
                    type: "choice",
                    required: true,
                    options: {
                        list: l
                    }
                }
            ]).then(function(a) {
                args.user = list[a.i - 1];
                _whois();
            }).catch(function(err) {
                e.mention().respond("That option is invalid!");
            });
        }
    } else {
        args.user = e.userID;
        return _whois();
    }

    function _whois() {
        var uid = args.user;
        //get alias
        dbUsers.find({
            uid: uid
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
            logger.debug(JSON.stringify(d));

            str += "**Username:** " + e.clean(d.name) + "\n";
            str += "**UID:** " + d.uid + "\n";
            if(d.nicks) {
                str += "**Previous nicks:** " + e.clean(sanitizeData(d.nicks).join(", ")) + "\n";
            }
            str += "**Previous names:** " + e.clean(sanitizeData(d.old).join(", ")) + "\n\n";

            var mentionedUser = e.getUser(args.user, e.serverID);

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
        if(err) {
            e.mention().text("Failed to set alias:").code(err.message).respond();
            return;
        }
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


var regex = /(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?/ig
function sanitizeData(data){
    return data.filter(e => {if(e == "" || e == undefined || e.trim() == "") return false; return true;}).map(function (e){
        return e.replace(regex, x => '<' + x + '>');
    });
}
