var request = require('request');
var logger = require('winston');
var async = require('async');
var crypto = require('crypto');

var TwitterWatcher = require("./lib/twitter.js");
var RedditWatcher = require("./lib/reddit.js");

module.exports = {
    version: "0.2.0",
    name: "Watcher",
    author: "Windsdon",
    init: WatchMod
}

function WatchMod(e, callback) {
    var list = [
        {
            id: "twitter",
            name: "Twitter",
            watcher: TwitterWatcher
        },
        {
            id: "reddit",
            name: "reddit",
            watcher: RedditWatcher
        }
    ];

    var self = this;

    this.watchers = {};

    var queue = async.queue(function(task, cb) {
        logger.debug("Loading watcher: " + task.id);
        task.watcher.init(e, function(err, commands) {
            if(!err) {
                try {
                    self[task.id] = new (task.watcher.construct)(e);
                    if(commands) {
                        commands.forEach(function(c) {
                            var stack = ["watch", task.id].concat(c.stack || [])
                            var permissions = ["watch.watcher." + task.id + (c.permissions ? "." + c.permissions : "")];
                            var params = c.action ? (c.params || []) : [
                                {
                                    id: "flags",
                                    type: "flags",
                                    options: {
                                        list: ["notify"]
                                    }
                                },
                                {
                                    id: "what",
                                    type: "string",
                                    required: true
                                }
                            ].concat(c.params || []);
                            var action = c.action ? c.action : async.apply(watch, task.id);
                            var help = c.help || "Create a " + task.name + " watcher";
                            var extra = c.extra || {};
                            e.register.addCommand(stack, permissions, params, action, help, extra);
                        });
                    }
                    logger.debug("Loaded watcher");
                } catch(err) {
                    logger.error("Failed to load watcher");
                    logger.error(err);
                    cb();
                }
            } else {
                logger.error("Failed to initialize watcher: " + task.id);
                logger.error(err);
            }
            cb();
        });
    }, 1);

    queue.drain = function(err) {
        e.register.addCommand(["unwatch"], ["watch.unwatch"], [
            {
                id: "id",
                type: "string",
                required: true
            }
        ], unwatch, "Deletes a watcher");
        e.register.addCommand(["watch", "list"], ["watch.list"], [
            {
                id: "flags",
                type: "flags",
                required: false,
                options: {
                    list: ["global"]
                }
            }
        ], watchList, "Lists watchers");

        // load when the bot is fully started
        e._disco.on("ready", function() {
            // load all watchers
            var db = e.db.getDatabase("watchers");
            db.find({}, function(err, data) {
                if(err) {
                    logger.error(err);
                }

                data.forEach(v => {
                    watch(v.handler, new (e._disco.DiscordBotMessage)(e._disco, "watch", v.sid, v.uid, v.uid, v.cid, "", {}), {}, v);
                });
            });
        });

        callback();
    };

    queue.push(list);
}

// handler = handler ID
function watch(handler, e, args, saved) {
    if(saved) {
        var p = e.mod[handler].watch(e, saved);
    } else {
        var id = crypto.randomBytes(3).toString('hex');
        var p = e.mod[handler].watch(e, {
            id: id,
            sid: e.serverID,
            cid: e.channelID,
            uid: e.userID,
            subject: args.what,
            args: args,
            notify: args.flags.notify ? e.userID : null,
            interval: 30, // default interval
            handler: handler
        });
    }

    p.then(function(obj) {
        obj.watcher.on("update", function(event) {
            handleEvent(e, event);
        });

        e.mod.watchers[obj.save.id] = obj.watcher;

        var db = e.db.getDatabase("watchers");
        db.update({
            id: obj.save.id
        }, obj.save, {upsert: true}, function(err, num) {
            if(err) {
                logger.error(err);
            }
        });
        if(!saved) {
            e.respond("Created watch with ID `" + obj.save.id + "`");
        }
        e._disco.logOnChannel(`**Created watcher** \`${obj.save.id}\` [**${obj.save.handler}**] <#${obj.save.cid}> ${obj.save.subject}`);
    }).catch(function(err) {
        logger.error(err);
        e.text("Can't create watch!").code(err.message).respond();
    });
}

function unwatch(e, args) {
    if(e.mod.watchers[args.id]) {
        e.mod.watchers[args.id].stop();
        delete e.mod.watchers[args.id];
        e.db.getDatabase("watchers").remove({
            id: args.id
        });
        e.respond("Deleted watcher `" + args.id + "`");
    } else {
        e.respond("**No watcher loaded with id `" + args.id + "`**");
    }
}

function watchList(e, args) {
    if(args.flags.global && !e.canUser("dangerous.watch.global")) {
        e.mention().respond("You can't use the global flag!");
        return;
    }

    var search = {};

    if(!args.flags.global) {
        search.sid = e.serverID
    }

    e.db.getDatabase("watchers").find(search, function(err, data) {
        if(err) {
            logger.error(err);
            return;
        }

        if(data.length == 0) {
            e.respond("**No watchers active**");
            return;
        }

        e.text("**Active watchers: **\n");

        data.forEach(v => {
            e.text(`\`${v.id}\` [**${v.handler}**] <#${v.cid}> ${v.subject}\n`);
        });

        e.respond();
    })
}

function handleEvent(e, event) {
    e.respond(event.what);
}
