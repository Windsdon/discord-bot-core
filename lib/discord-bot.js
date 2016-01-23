var logger = require("winston");
var CommandRegister = require("./command-register");
var perms = require("./permission"),
    PermissionManager = perms.PermissionManager;
var Database = require("./database");
var PluginManager = require("./plugin-manager");
var Parser = require("./parser");
var fs = require("fs");
var DiscordClient = require('discord.io');
var async = require("async");
var crypto = require("crypto");

function DiscordBot() {
    logger.info("Starting");
    this._version = require("../package.json").version;
    this._startTime = new Date();
    this.whitelist = [];
    this.commandControlHandles = [];
    this.init();
}

DiscordBot.prototype.init = function () {
    this.db = new Database();
    this.dba = this.db.getAccess("core");

    var self = this;

    self.createBot(function() {
        self.pm = new PermissionManager(self.dba, function() {
            self.register = new CommandRegister();
            self.plugins = new PluginManager(self, self.db, self.register, function() {
                self.loadParsers(function(){
                    // done loading everything!
                    self.startMessages();
                });
            });
        });
    });
};

DiscordBot.prototype.loadParsers = function (callback) {
    logger.info("Loading parsers");

    var self = this;
    this.parsers = {};

    var parserLoader = {
        list: [],
        index: 0
    };

    // add global parser
    parserLoader.list.push(0);

    for (var i in this.bot.servers) {
        if (this.bot.servers.hasOwnProperty(i)) {
            parserLoader.list.push(i);
        }
    }

    function loadNext() {
        if(parserLoader.index >= parserLoader.list.length) {
            logger.info("Finished loading parsers");
            callback.apply(self);
            return;
        }
        var sid = parserLoader.list[parserLoader.index++];
        self.getParam("activator", sid, function(val) {
            self.parsers[sid] = new Parser(self.register, val);
            logger.info(`Loaded parser ${sid} with activator "${val}"`);
            loadNext();
        });
    }

    loadNext();
};

/**
* Params are special type of db entries
* if they are not present for the current server, they default to the
* global value
*/
DiscordBot.prototype.getParam = function (name, sid, callback) {
    var self = this;
    this.dba.getDatabase("params", sid).find({
        name: name
    }, function(err, data) {
        if(err || data.length == 0) {
            if(sid) {
                // falback to the global value
                self.getParam(name, undefined, callback);
            } else {
                callback(null);
            }
        } else {
            callback(data[0].value);
        }
    });
};

DiscordBot.prototype.setParam = function (name, value, sid, callback) {
    var self = this;
    var dba = this.dba.getDatabase("params", sid);
    dba.find({
        name: name
    }, function(err, data) {
        if(data.length != 0) {
            dba.update({
                name: name
            }, {
                $set: {
                    value: value
                }
            }, {}, function(err, n, newDoc) {
                if(typeof(callback) == "function") {
                    callback(err, newDoc);
                }
            });
        } else {
            dba.insert({
                name: name,
                value: value
            }, function(err, newDoc) {
                if(typeof(callback) == "function") {
                    callback(err, newDoc);
                }
            })
        }
    });
};

DiscordBot.prototype.startMessages = function () {
    logger.info("Listening for incomming messages");
    var self = this;
    this.outbound = async.queue(function(task, callback) {
        if(task.message) {
            if(task.message.length >= 2000) {
                var warn = "*This message was longer than 2000 characters and has been reduced*\n ";
                task.message = warn + task.message.substring(0, 2000 - warn.length - 1);
            }
            self.bot.sendMessage(task, function(response) {
                callback(response);
            });
        } else if(task.file) {
            self.bot.uploadFile(task, function(response) {
                callback(response);
            });
        }
    }, 1);

    var self = this;
    this.getParam("whitelist", undefined, function(v) {
        if(typeof(v) != "object" || v == null) {
            v = [];
            self.setParam("whitelist", []);
        }
        self.whitelist = v;
    })
    this.bot.on("message", function(user, userID, channelID, message, rawEvent) {
        self.onMessage(user, userID, channelID, message, rawEvent);
    });
};

DiscordBot.prototype.onMessage = function (user, userID, channelID, message, rawEvent) {
    if(userID == this.bot.id) {
        // ignore the bot's own messages
        return;
    }
    var serverID = this.getServerID(channelID);
    logger.info(`@${user} (${userID}) #${channelID}@${serverID}\n ${message}`);

    // get the parser
    if(!this.parsers[serverID]) {
        logger.error("No parser for server " + serverID);
        return;
    }

    // parse the message
    var obj = this.parsers[serverID].parse(message);
    if(!obj) {
        // false means this command doesn't exist
        return;
    }

    if(this.whitelist.indexOf(channelID) == -1) {
        if(!obj.command.options.enableAll) {
            logger.info("This command is valid, but the channel is not monitored");
            return;
        }
    }

    var self = this;

    var e = new DiscordBotMessage(self, obj.command.mod, serverID, user, userID, channelID, message, rawEvent);

    if(!this.pm.canUser(userID, obj.command.permissions, serverID)) {
        logger.info("This user can't run this command");
        this.getParam("denyFeedback", serverID, function(r) {
            if(r) {
                e.mention().respond(" You can't run this command!");
            }
        })
        return;
    }

    if(obj.params === false) {
        // wrong usage
        e.mention().n().respond(obj.command.getHelp(this.parsers[serverID].activator));
        return;
    }

    obj.allow = true;

    async.applyEach(this.commandControlHandles, e, obj, function(err, results) {
        if(err) {
            logger.info("Execution blocked");
            if(err.message) {
                e.mention().respond(err.message);
            }
            return;
        }
        try {
            obj.command.call(e, obj.params);
        } catch(e) {
            e.text("Something went terribly wrong:").code(e.message).respond();
        }
    })
};

DiscordBot.prototype.addCommandControlHandler = function (handler, data) {
    logger.info("Added handler");
    this.commandControlHandles.push(async.apply(handler, data));
};

// whitlist is cached
DiscordBot.prototype.whitelistAdd = function (channelID) {
    if(this.whitelist.indexOf(channelID) != -1) {
        return;
    }

    this.whitelist.push(channelID);

    this.setParam("whitelist", this.whitelist);
};

DiscordBot.prototype.whitelistRemove = function (channelID) {
    if(this.whitelist.indexOf(channelID) == -1) {
        return;
    }

    this.whitelist.splice(this.whitelist.indexOf(channelID), 1);

    this.setParam("whitelist", this.whitelist);
};

DiscordBot.prototype.getServerID = function (channelID) {
    for (var sid in this.bot.servers) {
        if (this.bot.servers.hasOwnProperty(sid)) {
            if(Object.keys(this.bot.servers[sid].channels).indexOf(channelID) != -1) {
                return sid;
            }
        }
    }

    // global: private message
    return 0;
};

DiscordBot.prototype.createBot = function (callback) {
    logger.info("Creating bot instance");

    var self = this;
    var location = this.db.getStoragePath("key", "core");
    var key;
    try {
        key = fs.readFileSync(location + "/key");
    } catch(e) {
        logger.info("Generating key");
        key = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(location + "/key", key);
    }

    var login = false;
    try {
        var content = fs.readFileSync("./login.txt").toString();
        if(content.indexOf(":") != -1) {
            // plain text
            var plain = content;
            // encrypt this
            var cipher = crypto.createCipher('aes-256-cbc', key)
    		var crypted = cipher.update(content, 'utf8', 'hex')
    		crypted += cipher.final('hex');
            fs.writeFileSync("./login.txt", crypted);
        } else {
            var decipher = crypto.createDecipher('aes-256-cbc', key)
    		var dec = decipher.update(content, 'hex', 'utf8')
    		dec += decipher.final('utf8');
            var plain = dec;
        }
        if(plain.indexOf("\n") != -1) {
            plain = plain.substring(0, plain.indexOf("\n") - 1);
        }
        login = {
            email: plain.substring(0, plain.indexOf(":")),
            password: plain.substring(plain.indexOf(":") + 1)
        };

    } catch(e) {
        logger.error(e);
        logger.error("No login.txt file!");
        login = {
            email: "",
            password: ""
        }
    }

    this.bot = new DiscordClient({
        autorun: true,
        email: login.email,
        password: login.password
    });
    var self = this;
    this.bot.on("ready", function(e) {
        logger.info("Connected as " + self.bot.username + " - (" + self.bot.id + ")");
        callback(true);
    });
};

DiscordBot.prototype.queueMessage = function (channelID, message, callback) {
    if(typeof(message) == "string") {
        this.outbound.push({
            to: channelID,
            message: message
        }, callback);
    } else {
        this.outbound.push(message, callback);
    }
};

DiscordBot.prototype.queueFile = function (channelID, file) {
    if(typeof(message) == "string") {
        this.outbound.push({
            to: channelID,
            file: file
        }, callback);
    } else {
        this.outbound.push(file, callback);
    }
};

DiscordBot.prototype.getUserName = function (uid) {
    for (var sid in this.bot.servers) {
        if (this.bot.servers.hasOwnProperty(sid)) {
            for (var member in this.bot.servers[sid].members) {
                if (this.bot.servers[sid].members.hasOwnProperty(member)) {
                    if(member == uid) {
                        return this.bot.servers[sid].members[member].user.username
                    }
                }
            }
        }
    }

    logger.debug("Can't find username for " + uid);

    return uid;
};

DiscordBot.prototype.getUser = function (uid, _sid) {
    for (var sid in this.bot.servers) {
        if (this.bot.servers.hasOwnProperty(sid)) {
            if(typeof(_sid) != "undefined" && sid != _sid ) {
                continue;
            }
            for (var member in this.bot.servers[sid].members) {
                if (this.bot.servers[sid].members.hasOwnProperty(member)) {
                    if(member == uid) {
                        return this.bot.servers[sid].members[member].user;
                    }
                }
            }
        }
    }

    logger.debug("Can't find user " + uid);

    return null;
};

DiscordBot.prototype.editMessage = function (id, channelID, newMessage, callback) {
    this.bot.editMessage({
        channel: channelID,
        messageID: id,
        message: newMessage
    }, callback);
};

function DiscordBotMessage(disco, mod, serverID, user, userID, channelID, message, rawEvent) {
    this._disco = disco;
    this._mod = mod;
    this.mod = disco.plugins.plugins[mod];
    this.serverID = serverID;
    this.user = user;
    this.userID = userID;
    this.channelID = channelID;
    this.message = message;
    this.rawEvent = rawEvent;
    this.db = disco.db.getAccess(mod);
    this._prepend = "";
}

DiscordBotMessage.prototype.respond = function(message, callback) {
    if(typeof(message) == "undefined") {
        message = "";
    }
    if(typeof(message) == "string") {
        message = this._prepend + message;
    }
    this._disco.queueMessage(this.channelID, message, callback);
    this._prepend = "";
    return this;
};

DiscordBotMessage.prototype.respondFile = function(file, callback) {
    this._disco.queueFile(this.channelID, file, callback);
    this._prepend = "";
    return this;
};

DiscordBotMessage.prototype.mention = function (uid) {
    if(typeof(uid) == "undefined") {
        uid = this.userID;
    }

    this._prepend += `<@${uid}> `;

    return this;
};

DiscordBotMessage.prototype.text = function (message) {
    this._prepend += message;

    return this;
};

DiscordBotMessage.prototype.code = function (message, lang) {
    this._prepend += "```"
    if(typeof(lang) == "string") {
        this._prepend += lang;
    }
    this._prepend += "\n";
    this._prepend += message;
    this._prepend += "\n```\n"

    return this;
};

DiscordBotMessage.prototype.n = function () {
    this._prepend += "\n";

    return this;
};

DiscordBotMessage.prototype.getName = function (uid) {
    return this._disco.getUserName(uid);
};

DiscordBotMessage.prototype.getUser = function (uid, sid) {
    if(typeof(uid) == "undefined") {
        uid = this.userID;
    }
    return this._disco.getUser(uid, sid);
};

DiscordBotMessage.prototype.editMessage = function (id, channelID, newMessage, callback) {
    if(!channelID) {
        channelID = this.channelID;
    }
    this._disco.editMessage(id, channelID, this._prepend + newMessage, callback);
    this._prepend = "";
    return this;
};


module.exports = DiscordBot;
