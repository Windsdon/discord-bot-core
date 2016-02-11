var logger = require("winston");

function say(e, args) {
    if(args._str.length == 0) {
        e.mention().respond("You need to give me something to say!");
        return;
    }

    e.deleteMessage().respond(args._str);
}

function me(e, args) {
    var user = e.getUser();
    if(!user) {
        e.mention().respond("You don't seem to exist!");
        return;
    }

    var pic = `https://cdn.discordapp.com/avatars/${e.userID}/${user.avatar}.jpg`;

    e.mention().respond(" This is you!\n" + pic);
}

function ping(e, args) {
    e.mention().respond("Pong!", function(err, response){
        if(err) {
            e.code(err.message).respond();
            return;
        }
        var time = (new Date(response.timestamp)).getTime() - (new Date(e.rawEvent.d.timestamp)).getTime()

        e.mention().editMessage(response.id, e.channelID, `Pong! *${time}ms*`);
    });
}

function status(e, args) {
    var str = "```\n";
    var now = new Date();
    str += "DiscordBot v" + e._disco._version + "\n";
    str += "  Server time: " + now.toString() + "\n";
    str += "  Uptime: " + formatTime(now.getTime() - e._disco._startTime.getTime()) + "\n";
    str += "  " + Object.keys(e._disco.register.commands).length + " registered commands\n\n"
    str += "  Loaded plugins: \n";

    var plugins = Object.keys(e._disco.plugins.plugins);
    plugins.forEach(function(v) {
        var info = e._disco.plugins.pluginInfo[v];
        str += `    ${info.name} (${v}) v${info.version} ${info.author ? "(by " + info.author + ")" : ""}\n`;
    });

    str += "\n```";

    e.respond(str);
}

function help(e, args) {
    var activator = e._disco.parsers[e.serverID].activator;
    var str = "```\nList of commands you can access: \n\n";

    var start = "";
    var depth = 0;

    if(!args._str.match(/^ *$/)) {
        start = args._str.replace(/ +/gi, '.');
        depth = start.split(".").length;
        logger.debug(start, depth);
    }


    var canList = {};
    for (var cid in e._disco.register.commands) {
        if (e._disco.register.commands.hasOwnProperty(cid)) {
            if(cid.indexOf(start) != 0) {
                continue;
            }
            var v = e._disco.register.commands[cid];
            if(e._disco.pm.canUser(e.userID, v.permissions, e.serverID)) {
                var k = [];
                for(var i = 0; i <= depth; i++) {
                    if(!v.command[i]) {
                        break;
                    }
                    k.push(v.command[i]);
                }
                var k = k.join(".");
                if(!canList[k]) {
                    canList[k] = {};
                }
                if(v.command[depth + 1]) {
                    canList[k][v.command[depth + 1]] = {};
                }
            }
        }
    }

    for (var cname in canList) {
        if (canList.hasOwnProperty(cname)) {
            var cmd = e._disco.register.getCommand(cname);
            var c = cname.replace(".", " ");
            if(cmd != false) {
                str += `${activator}${c} ${cmd.params.getHelp()}\n    ${cmd.help}`;
                if(cmd.help != "") {
                    str += "\n";
                }
            }

            if(Object.keys(canList[cname]).length != 0) {
                if(cmd) {
                    str += "\n";
                }
                str += `${activator}${c} <${Object.keys(canList[cname]).join('|')}>\n`
            }

            str += "\n";
        }
    }

    str += "```";

    e.mention().pm(str);
    e.mention().respond("Check you PMs!");
}

function uid(e, args) {
    if(!args.name) {
        e.mention().respond("Your UID is `" + e.userID + "`");
        return;
    }

    var rx = new RegExp(args.name, 'gi');
    var regex = new RegExp();

    var users = [];
    var uids = [];
    for (var sid in e._disco.bot.servers) {
        if (e._disco.bot.servers.hasOwnProperty(sid)) {
            for (var uid in e._disco.bot.servers[sid].members) {
                if (e._disco.bot.servers[sid].members.hasOwnProperty(uid)) {
                    var name = e._disco.bot.servers[sid].members[uid].user.username;
                    if(uids.indexOf(uid) == -1 && rx.test(name)) {
                        users.push({
                            name: name,
                            uid: uid
                        });
                        uids.push(uid);
                    }
                }
            }
        }
    }

    var str = "";
    if(users.length == 0) {
        str = "I couldn't find anyone that matches `" + args.name + "`";
    } else {
        str = "I found these:\n\n";
        users.forEach(function(v) {
            str += `**${v.name}**: \`${v.uid}\`\n`;
        });
    }

    e.mention().n().respond(str);
}

module.exports = function(e) {
    e.register.addCommand(["say"], ["interaction.say"], [], say, "Says your message");
    e.register.addCommand(["me"], ["interaction.me"], [], me, "Look at yourself");
    e.register.addCommand(["ping"], ["interaction.ping"], [], ping, "Pongs you back");
    e.register.addCommand(["status"], ["interaction.status"], [], status, "Get run time and installed mods");
    e.register.addCommand(["help"], ["interaction.help"], [], help, "Get help on a command");
    e.register.addCommand(["uid"], ["interaction.uid"], [
        {
            id: "name",
            type: "string",
            required: false
        }
    ], uid, "Return the uid without pinging. Name is a regex.");
}

// extra stuff

function formatTime (millis) {
    var sec_num = Math.floor(millis / 1000);
    var millis  = millis % 1000;
    var days    = Math.floor(sec_num / (3600 * 24));
    var hours   = Math.floor((sec_num - days * 3600 * 24) / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)  - days * 3600 * 24) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60)  - days * 3600 * 24;

    if (days    < 10) {days   = "0"+days;}
    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    var time    = `${days}:${hours}:${minutes}:${seconds}.${millis}`;
    return time;
}
