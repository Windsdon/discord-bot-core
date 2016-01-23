var logger = require("winston");

function banHandler(o, e, args, callback) {
    // bans are global
    var dbBans = o.db.getDatabase("bans");

    dbBans.find({
        uid: e.userID
    }, function(err, data) {
        if(err) {
            logger.error(err);
            callback(true);
            return;
        }

        if(data.length == 1) {
            callback({
                message: "You have been banned for: " + data.reason
            });
        } else {
            callback(false);
        }

    })
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

module.exports = function(e) {
    e._disco.addCommandControlHandler(banHandler, e);
    e.db.getDatabase("bans").ensureIndex({
        fieldName: "uid",
        unique: true
    })
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

    e.register.addCommand(["eval"], ["dangerous.eval"], [], cmdEval, "Evals stuff");
}
