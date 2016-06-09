var logger = require("winston");
var async = require("async");
var crypto = require("crypto");
var moment = require('moment');

module.exports = function(e, callback) {
    e._disco.addCommandHandler(async.apply(unifyHandler, e), "start");

    e.register.addCommand(["unify"], ["modtools.unify"], [
        {
            id: "flags",
            type: "flags",
            options: {
                list: ["all"]
            }
        },
        {
            id: "status",
            type: "choice",
            options: {
                list: ["disable"]
            }
        }
    ], unify, "Set unified chat location");

    callback();
}

function unifyHandler(e, o, cb) {
    var db = e.db.getDatabase("unified");

    var msg = `_${moment().format('YYYY-MM-DD HH:mm:ss Z')}_ <#${o.channelID}>: **${o.user}**: ${o.message}`;

    db.find({
        $or: [
            {
                serverID: "*"
            },
            {
                serverID: o.serverID
            }
        ]
    }, function(err, data) {
        if(err) {
            return cb();
        }

        data.forEach(v => {
            if(v.channelID != o.channelID) {
                o._disco.queueMessage(v.channelID, msg);
            }
        });

        cb();
    });
}

function unify(e, args) {
    if(args.flags.all && !e.canUser("dangerous.viewall")) {
        e.mention().respond("You can't use the --all flag!");
        return;
    }

    var db = e.db.getDatabase("unified");

    if(args.status == "disable") {
        db.remove({
            channelID: e.channelID
        }, {
            multi: true
        }, function(err, n) {
            if(err) {
                logger.error(err);
                return;
            }
            if(n) {
                e.respond("**Disabled unified chat here**");
            } else {
                e.respond("**Nothing to disable!**");
            }
        })
    } else {
        var sid = args.flags.all ? "*" : e.serverID;
        db.update({
            channelID: e.channelID
        }, {
            channelID: e.channelID,
            serverID: sid
        }, {
            upsert: true
        }, function(err) {
            e.respond("**Unified chat for server " + sid + " enabled here!**");
        });
    }
}
