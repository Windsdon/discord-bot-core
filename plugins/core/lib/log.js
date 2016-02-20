var logger = require("winston");
var async = require("async");

module.exports = function(e) {
    e._disco.addCommandHandler(async.apply(logHandler, e), "end");
    e._disco.logOnChannel = function(message) {
        logOnChannel(e, message);
    }

    e.register.addCommand(["log"], ["log.set"], [{
        id: "action",
        type: "choice",
        options: {
            list: ["here", "enable", "disable"]
        },
        required: true
    }], logSet, "Config log");
}

function makeLog(o) {
    return `**${o.user}** on channel <#${o.channelID}> ran \`${o.message.replace(/[^\\]`/gi, "\`")}\``;
}

function logOnChannel(e, message, channelID) {
    if(channelID) {
        e._disco.queueMessage(channelID, `*${(new Date()).toString()}*\n` + message);
    } else {
        var dbLog = e.db.getDatabase("log");
        dbLog.find({
            config: "where"
        }, function(err, data) {
            if(err) {
                logger.error(err);
                return;
            }

            if(data.length == 1) {
                // log to channel
                e._disco.queueMessage(data[0].value, `*${(new Date()).toString()}*\n` + message);
            }
        });
    }


}

function logHandler(e, o, callback) {
    var dbLog = e.db.getDatabase("log");

    dbLog.find({
        config: "where"
    }, function(err, data) {
        if(err) {
            logger.error(err);
            return;
        }

        if(data.length == 1) {
            // log to channel
            logOnChannel(e, makeLog(o), data[0].value);
        }
    });

    dbLog.find({
        config: "enable"
    }, function(err, data) {
        if(err) {
            logger.error(err);
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

    o.e.logOnChannel = function(message) {
        logOnChannel(o.e, message);
    }

    callback();
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
