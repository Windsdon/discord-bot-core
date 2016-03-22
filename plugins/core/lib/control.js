var logger = require("winston");
var async = require("async");
var execSync = require('child_process').execSync;
var request = require("request");

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
        logger.debug(`override for ${o.userID} on ${o.serverID}`);
        o._overrideWhitelist = true;
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
            url: "https://ptb.discordapp.com/api/channels/" + e.channelID + "/messages?limit=" + count,
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
        e.respond("**Purging message**");
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

    e.register.addCommand(["eval"], ["dangerous.eval"], [], cmdEval, "Evals stuff");
    e.register.addCommand(["exec"], ["dangerous.exec"], [], cmdExec, "Executes on the shell");
}
