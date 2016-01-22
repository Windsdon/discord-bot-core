function say(e, args) {
    if(args._str.length == 0) {
        e.mention().respond(" You need to give me something to say!");
        return;
    }

    e.respond(args._str);
}

function me(e, args) {
    var user = e.getUser();
    if(!user) {
        e.mention().respond(" You don't seem to exist!");
        return;
    }

    var pic = `https://cdn.discordapp.com/avatars/${e.userID}/${user.avatar}.jpg`;

    e.mention().respond(" This is you!\n" + pic);
}

function ping(e, args) {
    e.mention().respond(" Pong!");
}

module.exports = function(e) {
    e.register.addCommand(["say"], ["interaction.say"], [], say, "Says your message");
    e.register.addCommand(["me"], ["interaction.me"], [], me, "Look at yourself");
    e.register.addCommand(["ping"], ["interaction.ping"], [], ping, "Pongs you back");
}
