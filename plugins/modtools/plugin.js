var logger = require("winston");
var async = require("async");

module.exports = {
    version: "0.3.0",
    name: "Mod Tools",
    author: "Windsdon",
    init: ModtoolsMod
}

function ModtoolsMod(e, callback) {
    this.dba = e.db;
    this._disco = e._disco;
    this.levels = ["INFO", "WARN", "ALERT"];

    e.register.addCommand(["mod", "loghere"], ["modtools.log.change"], [], logHere, "Change modlog location");

    async.series(
        [
            async.apply(require("./lib/rainbow.js"), e),
            async.apply(require("./lib/warns.js"), e),
            async.apply(require("./lib/mute.js"), e)
        ],
        callback
    );
}

ModtoolsMod.prototype.log = function(level, message, server, callback) {
    var db = this.dba.getDatabase("config", server);
    var self = this;
    level = level || "INFO";
    try {
        level = level.toUpperCase();
    } catch(err) {}
    callback = callback || () => {};
    db.find({
        config: "logChannel"
    }, function(err, data) {
        if(err) {
            logger.error(err);
            callback(err);
        }
        if(data.length == 1) {
            self._disco.queueMessage(data[0].value, "**[" + level + "]** " + message, callback);
        } else {
            callback();
        }
    })
};

function logHere(e, args) {
    var db = e.db.getDatabase("config", e.serverID);
    e.mod.log("INFO", `**${e.getName(e.userID)}** changed log channel to <#${e.channelID}>`, e.serverID, function() {
        db.update({
            config: "logChannel"
        }, {
            config: "logChannel",
            value: e.channelID
        }, {
            upsert: true
        }, function(err, data) {
            if(err) {
                throw err;
            }
            e.respond("**Modlogs now appear here**");
        });
    });
};

function modlog(e, args) {
    e.mod.log(args.message, args.level);
}
