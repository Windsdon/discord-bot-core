var logger = require("winston");
var async = require("async");

module.exports = function(e, callback) {
    e._disco.addCommandHandler(async.apply(cleanHandler, e), "start");
    e.register.addCommand(["mod", "autoclean"], ["modtools.autoclean"], [
        {
            id: "action",
            type: "bool",
            required: true
        }
    ], autoclean, "Set new messages to autodelete on this channel");

    callback();
}

function cleanHandler(e, o, callback) {
    var db = e.db.getDatabase("autoclean", o.serverID);

    db.find({
        cid: o.channelID
    }, function(err, data) {
        if(err) {
            return callback(err);
        }

        if(data.length) {
            logger.debug("Delete message due to autoclean!");
            e._disco.bot.deleteMessage({
                messageID: o.rawEvent.d.id,
                channel: o.channelID
            }, function(err) {
            });
            o.directives.disableChilds = true;
        }

        callback();
    });
}

function autoclean(e, args) {
    var db = e.db.getDatabase("autoclean", e.serverID);

    db.find({
        cid: e.channelID
    }, function(err, data) {
        if(err) {
            throw err;
        }

        if(args.action) {
            if(!data.length) {
                db.update({
                    cid: e.channelID
                }, {
                    cid: e.channelID
                }, {
                    upsert: true
                }, function(){
                    e.respond("**Autoclean enabled**");
                });
            } else {
                e.respond("**Autoclean is already enabled here**");
            }
        } else {
            if(data.length) {
                db.remove({ cid: e.channelID }, {}, function (err, numRemoved) {
                    e.respond("**Autoclean disabled**");
                });
            } else {
                e.respond("**Autoclean is not enabled here**");
            }
        }
    });


}
