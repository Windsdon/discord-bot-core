var logger = require("winston");
var async = require("async");

module.exports = function(e) {
    e._disco.addCommandHandler(async.apply(logHandler, e), "end");

    e.register.addCommand(["log"], ["log.set"], [{
        id: "action",
        type: "choice",
        options: {
            list: ["here", "enable", "disable"]
        },
        required: true
    }], logSet, "Config log");
}

function logHandler(e, o, callback) {
    var dbLog = e.db.getDatabase("log");

    dbLog.find({
        config: "where"
    }, function(err, data) {
        if(err) {
            logger.error(err);
            callback(err);
            return;
        }

        if(data.length == 1) {
            // log to channel
            e._disco.queueMessage(data[0].value, makeLog());
        }

        callback(null);
    });

    dbLog.find({
        config: "enable"
    }, function(err, data) {
        if(err) {
            logger.error(err);
            callback(err);
            return;
        }

        if(data.length == 1 && data[0].value) {
            dbLog.insert({
                timestamp: (new Date()).getTime(),
                uid: o.userID,
                channelID: o.channelID,
                message: o.message
            })
        }
    });

    function makeLog() {
        return `*${(new Date()).toString()}*\n**${o.user}** on channel <#${o.channelID}> ran \`${o.message.replace(/[^\\]`/gi, "\`")}\``;
    }
}

function logSet(e, args) {
    var dbLog = e.db.getDatabase("log");

    if(args.action == "here") {
        dbLog.find({
            config: "where"
        }, function(err, data) {
            if(err) {
                logger.error(err)
                return;
            }

            dbLog.update({
                config: "where"
            }, {
                config: "where",
                value: e.channelID
            }, { upsert: true }, function (err, numReplaced, upsert) {
                if(!err) {
                    if(upsert){
                        e.mention().respond("Now logging here");
                    } else {
                        e.mention().respond("Nothing changed");
                    }
                } else {
                    logger.error(err);
                }
            });
        });
    } else if(args.action == "enable") {
        dbLog.update({
            config: "enable"
        }, {
            config: "enable",
            value: true
        }, { upsert: true }, function (err, numReplaced, upsert) {
            if(!err) {
                if(upsert){
                    e.mention().respond("Logging enabled");
                } else {
                    e.mention().respond("Nothing changed");
                }
            } else {
                logger.error(err);
            }
        });
    } else if(args.action == "disable") {
        dbLog.update({
            config: "enable"
        }, {
            config: "enable",
            value: false
        }, { upsert: true }, function (err, numReplaced, upsert) {
            if(!err) {
                if(upsert){
                    e.mention().respond("Logging disabled");
                } else {
                    e.mention().respond("Nothing changed");
                }
            } else {
                logger.error(err);
            }
        });
    }
}
