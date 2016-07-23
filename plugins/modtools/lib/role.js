var logger = require("winston");
var async = require("async");
var crypto = require("crypto");

module.exports = function(e, callback) {
    e.register.addCommand(["mod", "role"], ["modtools.role"], [
        {
            id: "action",
            type: "bool",
            required: true
        },{
            id: "role",
            type: "role",
            required: true
        },{
            id: "user",
            type: "mention",
            required: true
        },{
            id: "reason",
            type: "rest",
            required: false
        }
    ], role, "Add or remove roles from users");

    callback();
}

function role(e, args) {
    if(!args.action && e.canUser("dangerous.imune.roleremove", args.user, e.serverID)) {
        return e.mention().respond("**This user is imune to role removal**");
    }

    var input = {
        serverID: e.serverID,
        roleID: args.role,
        userID: args.user
    };

    function cb(err) {
        if(err) {
            e.respond("**Failed to manage role:** " + err.message);
        } else {
            var m = `**${e.getName(e.userID)}** ${args.action ? "added" : "removed"} **${e.getName(args.user)}** ${args.action ? "to" : "from"} **${e.getRole(args.role).name}**`;
            e.respond(m);
            logger.debug(args.reason);
            if(args.reason && args.reason.trim()) {
                e.mod.log("INFO", m + " - _" + args.reason + "_", e.serverID);
            } else {
                e.mod.log("INFO", m, e.serverID);
            }
        }
    };

    if(args.action) {
        e._disco.bot.addToRole(input, cb);
    } else {
        e._disco.bot.removeFromRole(input, cb);
    }
}
