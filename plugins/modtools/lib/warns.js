var logger = require("winston");
var async = require("async");
var crypto = require("crypto");
var moment = require("moment");

module.exports = function(e, callback) {
    e.register.addCommand(["mod", "warn"], ["modtools.warn.create"], [
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
    ], warn, "Gives this user a warning");

    e.register.addCommand(["mod", "warns"], ["modtools.warn.view"], [
        {
            id: "flags",
            type: "flags",
            options: {
                list: ["by"],
                opts: {
                    boolean: true
                }
            }
        },
        {
            id: "user",
            type: "mention",
            required: true
        }
    ], listWarnings, "Lists the user's warning (or given --by user)");

    callback();
}

function warn(e, args) {
    var db = e.db.getDatabase("warns", e.serverID);
    var id = crypto.randomBytes(4).toString('hex');
    db.insert({
        _id: id,
        givenBy: e.userID,
        subject: args.user,
        reason: args.reason,
        timestamp: (new Date()).toString()
    });

    e.mod.log("info", `\`#${id}\` **<@${e.userID}> warned <@${args.user}>. Reason:** _${args.reason}_`, e.serverID);
    e.mention(args.user).text("received a warning: **" + args.reason + "** (by ").mention().text(") #" + id).respond();
}

function listWarnings(e, args) {
    var db = e.db.getDatabase("warns", e.serverID);
    function list(data) {
        if(data.length == 0) {
            e.text("_No results!_").n();
            return;
        }

        data.sort((a,b) => {
            if(new Date(a).getTime() < new Date(b).getTime()) {
                return -1;
            } else {
                return 1;
            }
        });

        data.forEach(v => {
            var date = moment(new Date(v.timestamp)).fromNow();
            e.text(`#${v._id} [${date}] _${e.getName(v.givenBy)}_ warned _${e.getName(v.subject)}_: **${v.reason}**`).n();
        })
    }

    if(args.flags.by) {
        db.find({
            givenBy: args.user
        }, function(err, data) {
            if(err) {
                throw err;
            }
            e.text(`**Listing warnings given by __${e.getName(args.user)}__**\n\n`);
            list(data);
            e.respond();
        });
    } else {
        db.find({
            subject: args.user
        }, function(err, data) {
            if(err) {
                throw err;
            }

            e.text(`**Listing warnings for __${e.getName(args.user)}__**\n\n`);
            list(data);
            e.respond();
        })
    }

}

function mute(e, args) {

}
