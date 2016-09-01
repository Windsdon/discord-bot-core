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
var Fiber = require('fibers');
var extend = require('extend');
var util = require('util');
var EventEmitter = require('events');
var Params = require('./params').Params;

function DiscordBot() {
    logger.info("Starting");
    this._version = require("../package.json").version;
    this._startTime = new Date();
    this.init();
}

util.inherits(DiscordBot, EventEmitter);

DiscordBot.prototype.init = function () {
    this.whitelist = [];
    this.commandHandlers = {
        "start": [],
        "parsed": [],
        "end": []
    };
    this.db = new Database();
    this.dba = this.db.getAccess("core");
    this.outbound = {};
    this.DiscordBotMessage = DiscordBotMessage;

    var self = this;

    self.createBot(function() {
        self.pm = new PermissionManager(self.dba, self, function() {
            self.register = new CommandRegister();
            self.plugins = new PluginManager(self, self.db, self.register, function() {
                self.loadParsers(function(){
                    if(typeof(self.logOnChannel) == "function") {
                        try {
                            var content = fs.readFileSync("./crash.log");
                            if(content.length != 0) {
                                self.logOnChannel("**CRASH LOG:**```\n" + content + "\n```")
                            }
                            fs.unlink("./crash.log");
                        } catch(err) {

                        }
                        self.logOnChannel("**Initialization complete**");
                    }
                    // done loading everything!
                    self.startMessages();
                    self.emit("ready");
                });
            });
        });
    });
};

DiscordBot.prototype.loadParsers = function (callback) {
    callback = callback || () => {};
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
    this.outbound = {};

    var self = this;
    this.getParam("whitelist", undefined, function(v) {
        if(typeof(v) != "object" || v == null) {
            v = [];
            self.setParam("whitelist", []);
        }
        self.whitelist = v;
    });
    this.getParam("blacklist", undefined, function(v) {
        if(typeof(v) != "object" || v == null) {
            v = [];
            self.setParam("blacklist", []);
        }
        self.blacklist = v;
    });
    this.bot.on("message", function(user, userID, channelID, message, rawEvent) {
        self.onMessage(user, userID, channelID, message, rawEvent);
    });
};

DiscordBot.prototype.onMessage = function (user, userID, channelID, message, rawEvent) {
    var self = this;

    if(typeof(rawEvent) != "object") {
        rawEvent = {};
    }

    // we move everything to an object
    // so the handlers can modify values later
    var o = {
        user: user,
        userID: userID,
        channelID: channelID,
        message: message,
        rawEvent: rawEvent,
        disco: self,
        _disco: self, // for consistency
        directives: {
            disableChilds: false, // disables message generation from this
            ignorePermissions: false,
            ignoreSelf: true
        }
    };

    if(rawEvent && rawEvent._directives) {
        for(i in rawEvent._directives) {
            logger.debug(`Set directive: ${i}=${rawEvent._directives[i]}`);
            o.directives[i] = rawEvent._directives[i];
        }
    }

    if(o.userID == self.bot.id && o.directives.ignoreSelf) {
        // ignore the bot's own messages
        return;
    }

    o.serverID = self.getServerID(o.channelID);
    logger.info(`@${o.user} (${o.userID}) #${o.channelID}@${o.serverID}\n ${o.message}`);

    this.emit("message", o);

    async.applyEachSeries(self.commandHandlers["start"], o, function(err) {
        if(err) {
            logger.info("Execution blocked");
            logger.info(err);
            if(err.message && !err.silent) {
                self.queueMessage(o.channelID, err.message);
            }

            // stop processing
        } else {
            doNext1();
        }
    });

    function handleError(err) {
        try {
            if(err.silent) {
                return;
            }
            var errStr = "";
            errStr += "<@" + o.userID + "> ";
            if(err.message !== false  && err.message.length > 0) {
                errStr += "Error: **" + err.message + "**\n";
            }
            if(err.displayHelp && typeof(o.obj.command.getHelp) == "function") {
                errStr += "Usage:\n" + o.obj.command.getHelp(self.parsers[o.serverID].activator);
            }
            self.queueMessage(o.channelID, errStr);
        } catch(err2) {
            logger.error(err2);
        }
    }

    function doNext1() {
        // get the parser
        if(!self.parsers[o.serverID]) {
            logger.error("No parser for server " + o.serverID);
            return;
        }

        // parse the message
        o.obj = self.parsers[o.serverID].parse(o.message, o);
        if(o.obj.error) {
            handleError(o.obj.error);
            return;
        }

        // apply the next set of handlers
        async.applyEachSeries(self.commandHandlers["parsed"], o, function(err, results) {
            if(err) {
                logger.info("Execution blocked");
                if(err.message && !err.silent) {
                    self.queueMessage(o.channelID, err.message);
                }

                // stop processing
            } else {
                doNext2();
            }
        });
    }

    function doNext2() {
        // check whitelist
        if(!o._overrideWhitelist && (self.whitelist.indexOf(o.channelID) == -1)) {
            if(o.obj.command.options && !o.obj.command.options.enableAll) {
                logger.info("This command is valid, but the channel is not monitored");
                return;
            }
        }

        // check blacklist
        if(!o._overrideBlacklist && (self.blacklist.indexOf(o.serverID) != -1)) {
            logger.info("This command is valid, but this server is blacklisted");
            return;
        }

        var e = new DiscordBotMessage(self, o.obj.command.mod, o.serverID, o.user, o.userID, o.channelID, o.message, o.rawEvent);

        o.e = e;

        if(!o.directives.ignorePermissions && !self.pm.canUser(o.userID, o.obj.command.permissions, o.serverID)) {
            logger.info("This user can't run this command");
            self.getParam("denyFeedback", o.serverID, function(r) {
                if(r) {
                    o.e.mention().respond(" You can't run this command!");
                }
            })
            return;
        }

        if(o.obj.error) {
            handleError(o.obj.error);
            return;
        }

        async.applyEachSeries(self.commandHandlers["end"], o, function(err) {
            if(err) {
                logger.info("Execution blocked");
                if(err.message) {
                    o.e.mention().respond(err.message);
                }
                return;
            }
            try {
                o.obj.command.call(e, o.obj.params.results);
            } catch(err) {
                logger.error(err);
                o.e.text("Something went terribly wrong:").code(err.message).respond();
            }
        });
    }
};

DiscordBot.prototype.addCommandHandler = function (handler, type) {
    if(!this.commandHandlers[type]) {
        logger.error(new Error("Invalid type: " + type));
        return;
    }
    logger.info("Added handler for " + type);
    this.commandHandlers[type].push(handler);
};

// whitelist is cached
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

// this is a server blacklist
// blacklist is cached
DiscordBot.prototype.blacklistAdd = function (serverID) {
    if(this.blacklist.indexOf(serverID) != -1) {
        return;
    }

    this.blacklist.push(serverID);

    this.setParam("blacklist", this.blacklist);
};

DiscordBot.prototype.blacklistRemove = function (serverID) {
    if(this.blacklist.indexOf(serverID) == -1) {
        return;
    }

    this.blacklist.splice(this.blacklist.indexOf(serverID), 1);

    this.setParam("blacklist", this.blacklist);
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
        var  email = plain.substring(0, plain.indexOf(":"));
        var password = plain.substring(plain.indexOf(":") + 1);

        if(email.length != 0) {
            login = {
                email: plain.substring(0, plain.indexOf(":")),
                password: plain.substring(plain.indexOf(":") + 1)
            };
        } else {
            login = {
                token: password
            }
        }

    } catch(e) {
        logger.error(e);
        logger.error("No login.txt file!");
        login = {
            email: "",
            password: ""
        }
    }

    login.autorun = true;

    this.bot = new DiscordClient(login);
    var self = this;
    var processed = false;
    this.bot.on("ready", function(e) {
        logger.info("Connected as " + self.bot.username + " - (" + self.bot.id + ")");
        if (!processed) {
            processed = true;
            callback(true);
        }
    });

    this.bot.on('disconnected', function(err) {
        logger.error(err);
        self.bot.connect();
    })
};

DiscordBot.prototype.splitMessage = function(message, chunkSize) {
    chunkSize = chunkSize || 1990;
    var preChunks = [];
    message.split("\n").forEach(function(v) {
        if(v.length < chunkSize) {
            preChunks.push(v);
        } else {
            var vParts = [""];
            v.split(" ").forEach(function(vv) {
                if(vv.length > chunkSize) {
                    var vvParts = vv.match(new RegExp('.{1,' + chunkSize + '}', 'g'));
                    vParts = vParts.concat(vvParts);
                } else {
                    if(vParts[vParts.length - 1].length + vv.length < chunkSize) {
                        vParts[vParts.length - 1] += " " + vv
                    } else {
                        vParts.push(vv);
                    }
                }
            });
            vParts.forEach(function(v) {
                preChunks.push(v);
            });
        }
    });

    var chunks = [""];
    while(preChunks.length > 0) {
        var str = preChunks.shift();
        if(chunks[chunks.length - 1].length + str.length < chunkSize) {
            chunks[chunks.length - 1] += str + "\n";
        } else {
            if(/```/gi.test(chunks[chunks.length - 1])) {
                chunks[chunks.length - 1] += "```";
                chunks.push("```" + str + "\n");
            } else {
                chunks.push(str + "\n");
            }
        }
    }

    return chunks;
}

DiscordBot.prototype.getOutbound = function (channelID) {
    var self = this;
    function trySend(task, callback, attempts) {
        if(!attempts) {
            attempts = 0;
        }
        if(task.message) {
            if(task.message.length >= 2000) {
                var warn = "**This message was longer than 2000 characters and has been split**\n";
                var parts = self.splitMessage(warn + task.message, 1990);
                logger.debug("Split message into " + parts.length + " parts.");
                parts.forEach(function(v) {
                    self.queueMessage(channelID, v);
                });
                callback();
                return;
            }
            self.bot.sendMessage(task, function(err, response) {
                if(err) {
                    logger.warn(err);
                    if(err.statusCode == 429) { // ratelimited
                        logger.warn("Rate limited! Attempt #" + attempts);
                        setTimeout(function() {
                            trySend(task, callback,  attempts++);
                        }, err.retry_after + 1000);
                        return;
                    }
                }
                callback(err, response);
            });
        } else if(task.file) {
            self.bot.uploadFile(task, function(err, response) {
                if(err) {
                    logger.warn(err);
                    if(err.statusCode == 429) { // ratelimited
                        logger.warn("Rate limited! Attempt #" + attempts);
                        setTimeout(function() {
                            trySend(task, callback,  attempts++);
                        }, err.retry_after + 1000);
                        return;
                    }
                }
                callback(err, response);
            });
        }
    }
    if(!this.outbound[channelID]) {
        this.outbound[channelID] = async.queue(trySend, 1);;
    }

    return this.outbound[channelID];
};

DiscordBot.prototype.queueMessage = function (channelID, message, callback) {
    if(typeof(message) == "string") {
        this.getOutbound(channelID).push({
            to: channelID,
            message: message
        }, callback);
    } else {
        this.getOutbound(channelID).push(message, callback);
    }
};

DiscordBot.prototype.queueFile = function (channelID, file, callback) {
    if(typeof(file) == "string") {
        this.getOutbound(channelID).push({
            to: channelID,
            file: file
        }, callback);
    } else if(file.path) {
        this.getOutbound(channelID).push({
            to: channelID,
            file: file.path
        }, callback);
    } else {
        this.getOutbound(channelID).push({
            to: channelID,
            file: file
        }, callback);
    }
};

DiscordBot.prototype.getUserName = function (uid) {
    var user = this.getUser(uid);
    var name = user ? user.username : uid;
    return name;
};

DiscordBot.prototype.getUser = function (uid, _sid) {
    var u = this.bot.users[uid];
    if(!u) {
        logger.debug("No user found!");
        return null;
    }
    u = extend(true, {}, u); //make a deep copy
    if(_sid) {
        for (var sid in this.bot.servers) {
            if (this.bot.servers.hasOwnProperty(sid)) {
                if(sid != _sid ) {
                    continue;
                }
                if(this.bot.servers[sid].members[uid]) {
                    u = extend(true, u, this.bot.servers[sid].members[uid]);
                }
            }
        }
    }
    u.user = extend(true, {}, u); // fix for old code which uses user.user

    return u;
};

DiscordBot.prototype.editMessage = function (id, channelID, newMessage, callback) {
    this.bot.editMessage({
        channel: channelID,
        messageID: id,
        message: newMessage
    }, callback);
};

DiscordBot.prototype.deleteMessage = function (id, channelID, callback) {
    this.bot.deleteMessage({
        channel: channelID,
        messageID: id
    }, callback);
};

DiscordBot.prototype.getRole = function (rid, sid) {
    if(sid) {
        if(!this.bot.servers[sid]) {
            return null;
        } else {
            return this.bot.servers[sid].roles[rid] || null;
        }
    } else {
        for (var sid in this.bot.servers) {
            if (this.bot.servers.hasOwnProperty(sid)) {
                if(this.bot.servers[sid].roles[rid]) {
                    return this.bot.servers[sid].roles[rid];
                }
            }
        }
    }
};

DiscordBot.prototype.getRoles = function (uid, sid) {
    var roles = {};
    var self = this;
    if(!sid) {
        if(!uid) {
            return null;
        } else {
            for (var sid in this.bot.servers) {
                if (this.bot.servers.hasOwnProperty(sid)) {
                    for (var muid in this.bot.servers[sid].members) {
                        if (this.bot.servers[sid].members.hasOwnProperty(muid)) {
                            if(muid == uid) {
                                this.bot.servers[sid].members[muid].roles.forEach(function(v) {
                                    if(!roles[v]) {
                                        roles[v] = self.getRole(v, sid);
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }

        return roles;
    }
    if(!this.bot.servers[sid]) {
        return null;
    }
    if(uid == null) {
        for (var mrid in this.bot.servers[sid].roles) {
            roles[mrid] = this.bot.servers[sid].roles[mrid];
        }
        return roles;
    }
    for (var uid in this.bot.servers[sid].members) {
        if (this.bot.servers[sid].members.hasOwnProperty(uid)) {
            this.bot.servers[sid].members[uid].forEach(function(v) {
                roles[v] = self.getRole(v, sid);
            });
        }
    }

    return roles;
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
    this.activator = disco.parsers[serverID].activator;
    this.globalActivator = disco.parsers["0"].activator;
    var user = disco.getUser(userID, serverID);
    this.nick = user ? user.nick : undefined;
    this._prepend = "";

    if(rawEvent && rawEvent._extend) {
        for(i in rawEvent._extend) {
            this[i] = rawEvent._extend[i];
        }
    }
}

DiscordBotMessage.prototype.respond = function(message, callback) {
    if(typeof(message) == "undefined") {
        message = "";
    }
    if(typeof(message) == "string") {
        message = this._prepend + message;
    }

    logger.debug(`Send message: ${message} on channel ${this.channelID}`);

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

DiscordBotMessage.prototype.getName = function (uid, noEscape) {
    if(noEscape) {
        return this._disco.getUserName(uid);
    } else {
        return this.clean(this._disco.getUserName(uid));
    }
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

DiscordBotMessage.prototype.getMod = function (mod) {
    return this._disco.plugins.plugins[mod];
};

DiscordBotMessage.prototype.command = function (command, rawEvent) {
    rawEvent = rawEvent || {};
    this._disco.onMessage(this.user, this.userID, this.channelID, this.activator + command, rawEvent);
};

DiscordBotMessage.prototype.deleteMessage = function (id, channelID, callback) {
    if(typeof(id) == "function") {
        callback = id;
        id = undefined;
        channelID = undefined;
    }

    id = id || this.rawEvent.d.id;
    channelID = channelID || this.channelID;
    callback = callback || ()=>{};

    this._disco.deleteMessage(id, channelID, callback);
    return this;
};

// uid can be null to get server roles
DiscordBotMessage.prototype.getRoles = function (uid, sid) {
    if(typeof(uid) == "undefined") {
        uid = this.userID;
    }
    sid = sid || this.serverID;

    return this._disco.getRoles(uid, sid);
};

DiscordBotMessage.prototype.getRole = function (rid, sid) {
    if(typeof(sid) == "undefined") {
        sid = this.serverID;
    }

    return this._disco.getRole(rid, sid);
};

DiscordBotMessage.prototype.roleName = function (rid, sid) {
    try {
        return this.getRole(rid, sid).name;
    } catch(e) {
        return undefined;
    }
};

DiscordBotMessage.prototype.pm = function(message, uid, callback) {
    if(typeof(message) == "undefined") {
        message = "";
    }
    if(typeof(message) == "string") {
        message = this._prepend + message;
    }
    if(typeof(uid) == "function") {
        callback = uid;
        uid = this.userID;
    } else if(!uid) {
        uid = this.userID;
    }

    callback = callback || () => {};

    this._disco.queueMessage(uid, message, callback);
    this._prepend = "";
    return this;
};

DiscordBotMessage.prototype.canUser = function(permissions, uid, sid) {
    uid = uid || this.userID;
    sid = sid || this.serverID;

    return this._disco.pm.canUser(uid, permissions, sid);
};

/**
* Escapes @, *, _, ~, # and `
*/
DiscordBotMessage.prototype.clean = function (text) {
    text = text || "";
    try {
        return text.replace(/[#@`*_~]/g, "\\$&");
    } catch(err) {
        return "";
    }
};

/**
* Returns a Promise which is resolved if the next message by "user"
* is successful at extracting the params provided, or rejected it if
* fails after messageLimit messages by that user. Passing null to uid
* accepts messages by any user. Callwords are not required. Make
* messageLimit NaN to run until resolved.
* Defaults:
*   messageLimit: 1
*   uid: e.userID
*/
DiscordBotMessage.prototype.expect = function (params, messageLimit, uid) {
    var self = this;
    params = new Params(params);
    messageLimit = parseInt(messageLimit);
    if(messageLimit <= 0) {
        messageLimit = 1;
    }
    if(uid !== null) {
        uid = this.userID;
    }
    return new Promise(function(resolve, reject) {
        var obj = null;
        async.whilst(function(){
            return (isNaN(messageLimit) || (--messageLimit) >= 0) && (obj === null);
        }, function(callback) {
            self._disco.once("message", function(o) {
                if((uid !== null && o.userID != uid) || o.channelID != self.channelID) {
                    if(!isNaN(messageLimit)) {
                        messageLimit++;
                    }
                    return callback();
                }
                try {
                    var extracted = params.get(o.message, self._disco);
                    if(extracted.error) {
                        callback(extracted.error);
                    } else {
                        obj = extracted.results;
                        callback(null);
                    }
                } catch(err) {
                    return callback(err);
                }
            });
        }, function(err) {
            if(err || !obj) {
                return reject(err);
            }

            return resolve(obj);
        });
    });
};

module.exports = DiscordBot;
