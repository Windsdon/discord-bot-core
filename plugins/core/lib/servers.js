var logger = require("winston");

function serverJoin(e, args) {
    e._disco.bot.acceptInvite(args.invite);
}

function id(e, args) {

}

function enable(e, args) {
    if(e._disco.whitelist.indexOf(e.channelID) != -1) {
        e.mention().respond("I'm already here!");
        return;
    }

    e._disco.whitelistAdd(e.channelID);
    e.mention().respond("Now monitoring this channel");
}

function disable(e, args) {
    if(e._disco.whitelist.indexOf(e.channelID) == -1) {
        // shouldn't happen
        e.mention().respond("This is awkward...");
        return;
    }

    e._disco.whitelistRemove(e.channelID);
    e.mention().respond("See you later!");
}

function blacklist(e, args) {
    if(args.action == "add") {
        if(e._disco.blacklist.indexOf(e.serverID) != -1) {
            return;
        } else {
            e._disco.blacklistAdd(e.serverID);
        }
    } else {
        if(e._disco.blacklist.indexOf(e.serverID) == -1) {
            return;
        } else {
            e._disco.blacklistRemove(e.serverID);
        }
    }
}


module.exports = function(e) {
    e.register.addCommand(["server", "join"], ["server.join"], [
        {
            id: "invite",
            type: "string",
            required: true
        }
    ], serverJoin, "Join a server using an invite code");

    e.register.addCommand(["enable"], ["management.enable"], [], enable, "Monitor a channel for commands", {
        enableAll: true
    });
    e.register.addCommand(["disable"], ["management.disable"], [], disable, "Stop monitoring a channel");
    e.register.addCommand(["blacklist"], ["management.blacklist"], [
        {
            id: "action",
            type: "choice",
            options: {
                list: ["add", "remove"]
            },
            required: true
        }
    ], blacklist, "Change blacklist settings");
}
