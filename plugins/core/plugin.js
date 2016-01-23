var Fiber = require('fibers');
var logger = require('winston');

function DiscordBotCore(e, callback) {

    require("./lib/group")(e);
    require("./lib/interactions")(e);
    require("./lib/servers")(e);
    require("./lib/control")(e);

    e.register.addCommand(["authkey"], [], [{
        id: "key",
        type: "string",
        required: true
    }], function(e, args) {
        e._disco.pm.applyPrivilegeKey(e.userID, args["key"], function(result) {
            if(result === false) {
                e.mention().respond("This key is invalid");
            } else {
                e.mention().respond("You are now on group " + result);
            }
        });
    }, "Join a group using a key", {
        enableAll: true
    });

    e.register.addCommand(["callme"], ["core.callme"], [{
        id: "name",
        type: "string",
        required: true
    }, {
        id: "where",
        type: "choice",
        options: {
            list: ["here", "all"]
        },
        required: false
    }], function(e, args) {
        var name = args["name"];
        var where = args["where"] == "here" ? e.serverID : "0";

        if(name.length > 1) {
            name += " ";
        }

        e._disco.setParam("activator", name, where, function() {
            e._disco.loadParsers(function() {
                e.mention().respond(" I'm now called `" + name + "` " + (where == "0" ? "everywhere" : "here"));
            });
        });
    }, "Change the activator string");

    e.register.addCommand(["param"], ["core.param"], [{
        id: "name",
        type: "string",
        required: true
    }, {
        id: "value",
        type: "string",
        required: false
    }], function(e, args) {
        if(args['value']) {
            e._disco.setParam(args['name'], args['value'], e.serverID, function(err, newDoc) {
                if(err) {
                    e.mention().respond(`Failed to update. Please look at the console.`);
                } else {
                    e.mention().respond(` \`${args['name']}\` set to \`${args['value']}\` here.`);
                }
            })
        } else {
            e._disco.getParam(args['name'], e.serverID, function(val) {
                e.mention().respond(` \`${args['name']}\` is \`${val}\` here.`);
            });
        }
    }, "Set and read params")

    callback();
}


var defaultParams = {
    activator: "!"
};

function setup(e, callback) {
    // first install!
    // let's setup all the basic info and defaults

    // create permissions
    // these are cached, so we don't need a callback
    e._disco.pm.createGroup("root");
    e._disco.pm.groupGrant("*", "root");

    var key = e._disco.pm.createPrivilegeKey("0:root");
    logger.info("Your auth key is " + key + ". Use it to get root privileges.");

    // load params
    var dbParams = e.db.getDatabase("params");
    dbParams.ensureIndex({
        fieldName: "name",
        unique: true
    });
    e.db.getDatabase("bans").ensureIndex({
        fieldName: "uid",
        unique: true
    });
    var paramList = [];
    for (var i in defaultParams) {
        if (defaultParams.hasOwnProperty(i)) {
            paramList.push({
                name: i,
                value: defaultParams[i]
            });
        }
    }

    Fiber(function() {
        var fiber = Fiber.current;
        paramList.forEach(function(v) {
            dbParams.insert(v, function(err, newDoc) {
                if(err) {
                    // probably non unique index, just ignore
                    logger.error(err);
                }
                fiber.run();
            });
            Fiber.yield();
        });

        callback();
    }).run();
}


module.exports = {
    version: "0.1.1",
    name: "Discord Bot Core",
    f: DiscordBotCore,
    setup: setup
}
