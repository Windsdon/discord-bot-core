var logger = require("winston");

function say(e, args) {
    if(args._str.length == 0) {
        e.mention().respond("You need to give me something to say!");
        return;
    }

    e.respond(args._str);
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
    e.mention().respond("Pong!", function(response){
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
        str += `    ${info.name} (${v}) v${info.version}\n`;
    });

    str += "\n```";

    e.respond(str);
}

function help(e, args) {
    var activator = e._disco.parsers[e.serverID].activator;
    var str = "List of commands you can access: \n\n";

    if(!args._str.match(/^ *$/)) {
        // some command
        e.mention().respond("Using help on specific commands is not yet supported!");
        return;
    }

    var start = "";
    var depth = 1;

    var canList = {};
    for (var cid in e._disco.register.commands) {
        if (e._disco.register.commands.hasOwnProperty(cid)) {
            var v = e._disco.register.commands[cid];
            if(e._disco.pm.canUser(e.userID, v.permissions, e.serverID)) {
                if(!canList[v.command[0]]) {
                    canList[v.command[0]] = {};
                }
                if(v.command[1]) {
                    canList[v.command[0]][v.command[1]] = {};
                }
            }
        }
    }

    logger.debug(JSON.stringify(canList));
    for (var cname in canList) {
        if (canList.hasOwnProperty(cname)) {
            var cmd = e._disco.register.getCommand(cname);
            if(cmd == false) {
                str += `\`${activator}${cname} <${Object.keys(canList[cname]).join('|')}>\`\n`
            } else {
                str += cmd.getHelp(activator) + "\n";
            }

            str += "\n";
        }
    }

    e.mention().respond(str);
}

module.exports = function(e) {
    e.register.addCommand(["say"], ["interaction.say"], [], say, "Says your message");
    e.register.addCommand(["me"], ["interaction.me"], [], me, "Look at yourself");
    e.register.addCommand(["ping"], ["interaction.ping"], [], ping, "Pongs you back");
    e.register.addCommand(["status"], ["interaction.status"], [], status, "Get run time and installed mods");
    e.register.addCommand(["help"], [], [], help, "Get help on a command");
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
