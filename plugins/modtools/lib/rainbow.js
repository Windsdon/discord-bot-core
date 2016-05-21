var logger = require("winston");
var async = require("async");
var crypto = require("crypto");

module.exports = function(e, callback) {
    e._disco.addCommandHandler(async.apply(rainbowHandler, e), "start");

    e.register.addCommand(["rainbow"], ["modtools.rainbow"], [
        {
            id: "flags",
            type: "flags",
            options: {
                list: ["delay", "s"]
            }
        }, {
            id: "role",
            type: "string",
            required: true
        }, {
            id: "user",
            type: "mention",
            required: false
        }
    ], rainbow, "Set a role to change color with time (using --delay) or when a user speaks (reduces the number of updates)");

    loadRainbows(e);

    logger.debug("Finished loading rainbows");

    callback();
}

function byte2Hex(n) {
    var nybHexString = "0123456789ABCDEF";
    return String(nybHexString.substr((n >> 4) & 0x0F,1)) + nybHexString.substr(n & 0x0F,1);
}

function RGB2Color(r,g,b) {
    return '#' + byte2Hex(r) + byte2Hex(g) + byte2Hex(b);
}

function getSpectrum(i) {
    return RGB2Color(Math.sin(i * 2 * Math.PI) * 128 + 127, Math.sin(i * 2 * Math.PI + 2 * Math.PI / 3) * 128 + 127, Math.sin(i * 2 * Math.PI + 4 * Math.PI / 3) * 128 + 127);
}

function getRandomColor() {
    return "#" + crypto.randomBytes(3).toString('hex');
}

var intervals = [];

function loadRainbows(e) {
    var db = e.db.getDatabase("rainbow");
    var divs = 25;
    for(var i in intervals) {
        clearInterval(intervals[i]);
    }
    db.find({
        type: "interval"
    }, function(err, data) {
        if(err) {
            logger.error(err);
        }
        if(data && data.length) {
            for(var i in data) {
                var u = 0;
                intervals.push(setInterval(function() {
                    e._disco.bot.editRole({
                        server: data[i].server,
                        role: data[i].role,
                        color: data[i].spectrum ? getSpectrum(u) : getRandomColor()
                    });
                    u += 1/divs;
                    if(u > 1) {
                        u = 0;
                    }
                }, data[i].interval));
            }

            logger.debug("Loaded " + data.length + " rainbow roles");
        }
    });
}

function rainbowHandler(e, o, callback) {
    var db = e.db.getDatabase("rainbow");
    db.find({
        type: "user",
        uid: o.userID
    }, function(err, data) {
        if(err) {
            logger.error(err);
        }
        if(data && data.length) {
            for(var i in data) {
                var v = {
                    server: data[i].server,
                    role: data[i].role,
                    color: getRandomColor()
                };
                o._disco.bot.editRole(v, function(err) {
                    if(err) {
                        logger.warn(err);
                    }
                });
            }
        }
    });

    callback();
}

function rainbow(e, args) {
    var db = e.db.getDatabase("rainbow");

    db.find({
        role: args.role
    }, function(err, data) {
        if(data.length) {
            db.remove({
                role: args.role
            }, {
                multi: true
            }, function() {
                e.respond("Removed rainbow from role " + args.role);
                loadRainbows(e);
            });
        } else {
            if(!args.user && !args.flags.delay) {
                e.respond("No delay given");
                return;
            }
            db.insert({
                type: args.user ? "user" : "interval",
                uid:  args.user,
                interval: args.user ? undefined : args.flags.delay,
                spectrum: args.flags.s ? true : false,
                role: args.role,
                server: e.serverID
            });
            e.respond("Added rainbow for role " + args.role);
            loadRainbows(e);
        }
    });
}
