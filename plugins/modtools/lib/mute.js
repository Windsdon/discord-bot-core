var logger = require("winston");
var async = require("async");
var crypto = require("crypto");
var moment = require("moment");

module.exports = function(e, callback) {
    e._disco.addCommandHandler(async.apply(muteHandler, e), "start");
    e.register.addCommand(["mod", "mute"], ["modtools.mute.add"], [
        {
            id: "user",
            type: "mention",
            required: true
        },
        {
            id: "reason",
            type: "rest",
            required: true
        }
    ], mute, "Mutes this user");
    e.register.addCommand(["mod", "unmute"], ["modtools.mute.remove"], [
        {
            id: "user",
            type: "mention",
            required: true
        }
    ], unmute, "Unmute this user");
    callback();
}

function muteHandler(e, o, callback) {
    var db = e.db.getDatabase("mutes", o.serverID);

    db.find({
        uid: o.userID
    }, function(err, data) {
        if(err) {
            return callback(err);
        }

        if(data.length) {
            logger.debug("Delete message due to mute!");
            e._disco.logOnChannel(`Removed a message from **${o.user}**. Reason: _${data[0].reason}_`);
            e._disco.bot.deleteMessage({
                messageID: o.rawEvent.d.id,
                channel: o.channelID
            }, function(err) {
            });
        }

        callback();
    });
}

function mute(e, args) {
    var db = e.db.getDatabase("mutes", e.serverID);
    db.find({
        uid: args.user
    }, function(err, data) {
        if(err) {
            throw err;
        }

        if(data.length) {
            return e.respond(`**__${e.getName(args.user)}__ is already muted**`);
        }

        db.insert({
            uid: args.user,
            reason: args.reason,
            by: e.userID,
            timestamp: (new Date()).toString()
        }, function(){
            e.text("**").mention().text("muted ").mention(args.user).respond(`Reason: **_${args.reason}_` );
            e.mod.log("INFO", `**__${e.getName(e.userID)}__ muted __${e.getName(args.user)}__. Reason: ** _${args.reason}_`, e.serverID);
        })
    });
}

function unmute(e, args) {
    var db = e.db.getDatabase("mutes", e.serverID);
    db.remove({
        uid: args.user
    }, {}, function (err, numRemoved) {
        if(err) {
            throw err;
        }
        if(numRemoved == 0) {
            return e.respond(`**__${e.getName(args.user)}__ isn't muted**`);
        } else {
            e.text("**").mention().text("unmuted ").mention(args.user).respond("**");
            e.mod.log("INFO", `**__${e.getName(e.userID)}__ unmuted __${e.getName(args.user)}__**`, e.serverID);
        }
    });
}
