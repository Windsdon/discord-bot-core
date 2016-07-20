var logger = require("winston");
var CryptoJS = require("crypto-js");
var request = require("request");

module.exports = {
    version: "1.2.0",
    name: "Misc",
    author: "Windsdon",
    init: MiscMod
}


function MiscMod(e, callback) {
    e.register.addCommand(["size"], ["misc.size"], [
        {
            id: "user",
            type: "mention",
            required: false
        }
    ], size, "Get your size");
    e.register.addCommand(["nt"], ["misc.nt"],[
        {
            id: "value",
            type: "string",
            required: false,
            options: {
                validation: /^(\d+|\d{1,2}\/\d{1,2}|random)$/
            }
        },
        {
            id: "type",
            type: "choice",
            options: {
                list: ["trivia", "math", "date", "year"]
            },
            required: false
        }
    ], numbertrivia, "Get some number trivia");
    e.register.addCommand(["ship"], ["misc.ship"], [
        {
            id: "subjects",
            type: "multistr",
            required: false
        }
    ], ship, "Create ship names");
    e.register.addCommand(["lenny"], ["misc.lenny"], [], lenny, "( ͡° ͜ʖ ͡°)");
    e.register.addCommand(["wtf"], ["misc.wtf"], [], wtf, "ಠ_ಠ");
    callback();
}

function size(e, args) {
    var subject = args.user || e.userID;
    var hash = CryptoJS.MD5(subject).toString();
    var n = (parseInt(hash.substring(5, 9), 16) * 4) % 0xffff;
    var u = n/32768 - 1; // [-1,1]
    if(Math.abs(u) < 0.001) {
        if(u < 0) {
            u = -0.001;
        } else {
            u = 0.001;
        }
    }
    var r = Math.pow(0.5 - Math.cos(Math.PI * u)/2, 1.5) * (u/Math.abs(u)) * Math.exp(u)/Math.E;
    if(r > 1) {
        r = 1;
    }
    var s = Math.abs(15 + r * 10);
    e.respond(e.getName(subject) + " is **" + s.toFixed(1) + "cm**");
}

function lenny(e, args) {
    e.respond("( ͡° ͜ʖ ͡°)");
}

function wtf(e, args) {
    e.respond("ಠ_ಠ");
}

function numbertrivia(e, args) {
    var url = "http://numbersapi.com/";
    args.value = args.value || "random";
    url += args.value;

    if(args.type) {
        url += "/" + args.type;
    }

    request(url, function(err, req, body) {
        if(err) {
            e.code(err.message).respond();
            return;
        }

        e.mention().respond(body);
    });
}

function trueName(bot, server, uid) {
    var name = uid;
    if(bot.users[uid]) {
        name = bot.users[uid].username;
    }
    if(server.members[uid] && server.members[uid].nick) {
        name = server.members[uid].nick;
    }

    return name;
}

function element(arr) {
    return arr[~~(Math.random() * arr.length)];
}

function ship(e, args) {
    if(!args.subjects) {
        args.subjects = [];
    }

    while(args.subjects.length < 2) {
        var members = Object.keys(e._disco.bot.servers[e.serverID].members);
        var name = trueName(e._disco.bot, e._disco.bot.servers[e.serverID], members[Math.floor(Math.random() * members.length)]);
        if(args.subjects.indexOf(name) != -1) {
            continue;
        }
        args.subjects.push(name);
    }

    if(Math.random() > 0.5) {
        var temp = args.subjects.pop();
        args.subjects.unshift(temp);
    }

    var shipName = "";
    var n0 = args.subjects[0];
    var n1 = args.subjects[1];
    var s0 = n0.split(" ");
    var s1 = n1.split(" ")

    switch(~~(Math.random() * 2)) {
        case 0:
            if(s0.length > 2 || s1.length > 2) {
                shipName = s0.slice(0, Math.max(1, ~~(Math.random() * s0.length))).join(" ")
                + " " + s1.slice(Math.min(-(~~(Math.random() * s1.length)) + 1, -1)).join(" ");
                var t = "";
                shipName.split(" ").forEach(v => {
                    t += v.charAt(0).toUpperCase() + v.slice(1) + " ";
                });
                shipName = t;
                break;
            }
            // fallback
        case 1:
            s0 = element(s0);
            s1 = element(s1);
            shipName = s0.substring(0, Math.max(2, ~~(Math.random() * s0.length)));
            shipName += s1.substring(Math.max(2, ~~(Math.random() * s1.length)));
            shipName = shipName.toLowerCase();
            shipName = shipName.charAt(0).toUpperCase() + shipName.slice(1);
            break;
    }

    e.respond(args.subjects.join(" **and** ") + ": **_" + shipName + "_**");
}
