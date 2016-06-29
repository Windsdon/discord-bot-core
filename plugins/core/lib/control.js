var logger = require("winston");
var async = require("async");
var execSync = require('child_process').execSync;
var request = require("request");
var fs = require('fs');

function banHandler(e, o, callback) {
    // bans are global
    var dbBans = e.db.getDatabase("bans");

    dbBans.find({
        uid: o.userID
    }, function(err, data) {
        if(err) {
            logger.error(err);
            callback(err);
            return;
        }

        if(data.length == 1) {
            callback({
                message: "You have been banned for: " + data.reason
            });
        } else {
            callback(null);
        }

    })
}

function cooldownHandler(e, o, callback) {
    if(!o.obj.command.options.cooldown || e._disco.pm.canUser(o.userID, "override.cooldown", o.serverID)) {
        // no cooldown is set
        callback(null);
        return;
    }

    // get cooldown in milliseconds
    var cdms = o.obj.command.options.cooldown * 1000;

    // get the db, server specifc
    var dbCooldown = e.db.getDatabase("cooldown", e.serverID);

    // get current cooldown
    dbCooldown.find({
        uid: o.userID,
        cmd: o.obj.command.getID()
    }, function(err, data) {
        var now = (new Date()).getTime();

        if(err) {
            logger.error(err);
            callback(err);
            return;
        }

        if(data.length == 0) {
            // insert new cooldown
            dbCooldown.insert({
                uid: o.userID,
                cmd: o.obj.command.getID(),
                time: now
            }, function(err) {
                callback(err);
            });
        } else {
            // check if in cooldown
            if(now - data[0].time < cdms) {
                callback({
                    message: "You are doing that too fast!"
                });
                return;
            } else {
                dbCooldown.update({
                    uid: o.userID,
                    cmd: o.obj.command.getID()
                }, {
                    $set: {
                        time: now
                    }
                }, {}, function(err, data) {
                    callback(err);
                });
            }
        }
    });
}

function whitelistOverride(e, o, callback) {
    if(e._disco.pm.canUser(o.userID, ["override.whitelist"], o.serverID)) {
        logger.debug(`Whitelist override for ${o.userID} on ${o.serverID}`);
        o._overrideWhitelist = true;
    }
    if(e._disco.pm.canUser(o.userID, ["override.blacklist"], o.serverID)) {
        logger.debug(`Blacklist override for ${o.userID} on ${o.serverID}`);
        o._overrideBlacklist = true;
    }
    callback(null);
}

function ban(e, args) {
    e.db.getDatabase("bans").insert({
        uid: args.user,
        reason: args._str
    }, function(err, newDoc) {
        if(err) {
            e.mention().respond("This user is already banned");
        } else {
            e.mention().text("Banned ").mention(args.user).respond(`with message: ${args._str}`);
        }
    });
}

function unban(e, args) {
    e.db.getDatabase("bans").remove({
        uid: args.user
    }, {},  function(err, n) {
        if(err || n == 0) {
            e.mention().respond("This user isn't banned!");
        } else {
            e.mention().text("Unbanned ").mention(args.user).respond("");
        }
    });
}

function cmdEval(e, args) {
    var str = "```javascript\n";

    str += eval(args._str);

    str += "\n```";

    e.respond(str);
}

function cmdExec(e, args) {
    var str = "```javascript\n";

    str += execSync(args._str);

    str += "\n```";

    e.respond(str);
}

function purge(e, args) {
    function remove(before, count, callback) {
        logger.debug("Call to remove before: " + before);
        request({
            url: "https://discordapp.com/api/channels/" + e.channelID + "/messages?limit=" + count + "&before=" + before,
            headers: {
                authorization: e._disco.bot.internals.token
            }
        }, function(err, response, body) {
            if(err) {
                callback(err);
                return;
            }

            var data = JSON.parse(body);

            if(args.user) {
                data = data.filter(function(v) {
                    return v.author.id == args.user;
                });
            }

            var last = null;

            var q = async.queue(function(message, cb) {
                logger.verbose("Delete message: " + message.id + " from: " + message.author.id);
                function _delete(id, channel, cb2) {
                    e.deleteMessage(id, channel, function(err2, data) {
                        if(err2 && err2.statusCode == 429) {
                            logger.warn("Rate limit", err2)
                            setTimeout(function() {
                                _delete(id, channel, cb2);
                            }, err2.retry_after + 1000);
                            return;
                        }
                        if(!err) {
                            last = id;
                        }
                        cb2(err2);
                    })
                }

                _delete(message.id, e.channelID, cb);
            });

            q.drain = function(err) {
                callback(err, data, last);
            }
            q.push(data);
        });
    }


    function removeMore(before, count, callback) {
        var limit = count > 100 ? 100 : count;
        remove(before, limit, function(err, data, last) {
            if(err || !data) {
                callback(err);
            }

            if(count - limit <= 0) {
                callback(err, data, last);
            } else {
                removeMore(err, count - limit, callback);
            }
        })
    }

    if(args.flags.all) {
        if(!e.canUser("control.purge.all")) {
            e.mention().respond("You can't use the --all flag!");
            return;
        }
        function iterate(err, data, last) {
            if(err) {
                logger.error(err);
                e.code(err.message).respond();
                return;
            }
            if(last) {
                removeMore(last, 100, iterate);
            } else {
                e.code("Done").respond();
            }
        }
        removeMore(e.rawEvent.d.id, 100, iterate);
        e.respond("**Purging everything in this channel**");
        return;
    }

    if(args.user) {
        e.respond("**Purging messages from __" + e.getName(args.user) + "__**");
    } else {
        e.respond("**Purging messages**");
    }

    removeMore(e.rawEvent.d.id, args.count, function(err) {
        if(err) {
            logger.error(err);
            e.code(err.message).respond();
            return;
        }
        logger.debug("Done!");
        e.code("Done!").respond();
    });
}

function name(e, args) {
    e._disco.bot.editUserInfo({username: args.name});
}

function picture(e, args) {
    if(!args.url) {
        e._disco.bot.editUserInfo({avatar: fs.readFileSync('avatar.png', 'base64')});
        return;
    }
    request.get(args.url).on('error', function(err) {
        e.respond(err.message);
        logger.error(err);
    }).on('end', function() {
        try {
            e._disco.bot.editUserInfo({avatar: fs.readFileSync('avatar.png', 'base64')});
        } catch(err) {
            e.code(err.message).respond();
            logger.error(err);
        }
    }).pipe(fs.createWriteStream('avatar.png'));
}

function playing(e, args) {
    e._disco.bot.setPresence({game: args.game || null});
    e._disco.setParam("playing", args.game || null);
}

function run(e, args) {
    if(args.flags.as) {
        e.userID = args.flags.as;
    }

    e.command(args._str);
}

function proxy(e, args) {
    if(!args.channel && !args.user) {
        return e.respond("Nowhere to proxy to!");
    }

    if(args.user) {
        e.channelID = args.user;
        e.command(args.command);
        return;
    }

    if(args.channel) {
        e.channelID = args.channel.match(/<#([0-9]+)>/)[1];
        e.command(args.command);
        return;
    }
}

module.exports = function(e) {
    e._disco.addCommandHandler(async.apply(banHandler, e), "end");
    e._disco.addCommandHandler(async.apply(cooldownHandler, e), "end");
    e._disco.addCommandHandler(async.apply(whitelistOverride, e), "parsed");

    e.db.getDatabase("bans").ensureIndex({
        fieldName: "uid",
        unique: true
    });
    e.register.addCommand(["ban"], ["control.ban"], [{
        id: "user",
        type: "mention",
        required: true
    }], ban, "Ban people");
    e.register.addCommand(["unban"], ["control.ban"], [{
        id: "user",
        type: "mention",
        required: true
    }], unban, "Unban people");

    e.register.addCommand(["purge"], ["control.purge"], [
        {
            id: "flags",
            type: "flags",
            options: {
                opts: {
                    boolean: true
                },
                list: ["all"]
            }
        },
        {
            id: "count",
            type: "number",
            required: true
        },
        {
            id: "user",
            type: "mention",
            required: false
        }
    ], purge, "Purge messages on the current channel. --all overrides count.");

    e.register.addCommand(["name"], ["control.name"], [
        {
            id: "name",
            type: "string",
            required: true
        }
    ], name, "Change the bot's name");
    e.register.addCommand(["picture"], ["control.picture"], [
        {
            id: "url",
            type: "string",
            required: false
        }
    ], picture, "Change the bot's picture (will download from the given url)");
    e.register.addCommand(["playing"], ["control.playing"], [
        {
            id: "game",
            type: "string",
            required: false
        }
    ], playing, "Change the bot's playing status");

    e._disco.getParam("playing", 0, function(value) {
        if(value) {
            e._disco.bot.setPresence({game: value});
        }
    })

    e.register.addCommand(["eval"], ["dangerous.eval"], [], cmdEval, "Evals stuff");
    e.register.addCommand(["exec"], ["dangerous.exec"], [], cmdExec, "Executes on the shell");
    e.register.addCommand(["run"], ["dangerous.run"], [
        {
            id: "flags",
            type: "flags",
            options: {
                list: [
                    {
                        id: "as",
                        type: "mention"
                    }
                ]
            }
        }
    ], run, "Executes a command with extra settings");

    e.register.addCommand(["proxy"], ["dangerous.proxy"], [
        {
            id: "user",
            type: "mention",
            required: false
        },{
            id: "channel",
            type: "string",
            required: false,
            options: {
                validation: /^<#[0-9]+>$/
            }
        },{
            id: "command",
            type: "rest",
            required: true
        }
    ], proxy, "Execute a command and send the results somewhere else");
}
