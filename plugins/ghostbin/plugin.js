var request = require("request");
var logger = require("winston");
var EventEmitter = require('events');
var util = require('util');
var crypto = require("crypto");
var CryptoJS = require("crypto-js");
var fs = require("fs")

module.exports = {
    version: "1.0.0",
    name: "Ghostbin exporter",
    author: "Windsdon",
    init: GhostMod
}

function GhostMod(e, callback) {
    e.register.addCommand(["gb"], ["ghostbin.export"], [
        {
            id: "count",
            type: "number",
            required: true
        }
    ], gbexport, "Export chatlog to Ghostbin", {
        cooldown: 30
    });

    var location = e.db.getStoragePath("key");
    try {
        this.key = fs.readFileSync(location + "/key").toString();
    } catch(e) {
        logger.info("Generating key");
        this.key = crypto.randomBytes(128).toString('hex');
        fs.writeFileSync(location + "/key", this.key);
    }

    callback();
}

function gbexport(e, args) {
    request({
        url: "https://discordapp.com/api/channels/" + e.channelID + "/messages?limit=" + (args.count > 100 ? 100 : args.count),
        headers: {
            authorization: e._disco.bot.internals.token
        }
    }, function(err, res, body) {
        if(err) {
            logger.error(err);
            e.code(err.message).respond();
            return;
        }

        var channelName = "unknown-channel";
        if(e._disco.bot.servers[e.serverID] && e._disco.bot.servers[e.serverID].channels[e.channelID]) {
            channelName = e._disco.bot.servers[e.serverID].channels[e.channelID].name;
        }

        var arr = JSON.parse(body);
        var text = "";
        var title = "#" + channelName + " - " + (new Date()).toString();
        arr.reverse().forEach(function(v) {
            var att = "";
            v.attachments.forEach(function(k) {
                att += `![${k.filename}](${k.url})`;
            });
            text += `**${e.clean(v.author.username)}**: ${att ? att : ""} ${v.content}\n\n`;
        });

        text += "\n\n### Validation: " + CryptoJS.HmacSHA1(text, e.mod.key);

        var password = crypto.randomBytes(5).toString('hex');
        var gb = new Ghostbin(text, title, "markdown", "-1", password, function(err, url) {
            e.text(`**Password:** ${password}\n`).respond("http://ghostbin.com" + url);
        });
    });
}

function Ghostbin(text, title, lang, expire, password, callback) {
    var args = {};
    var order = ["text", "title", "lang", "expire", "password"];

    for (var i = 0; i < arguments.length; i++) {
        if(typeof(arguments[i]) == "function") {
            callback = arguments[i];
            break;
        } else {
            var p;
            if(p = order.shift()) {
                if(p) {
                    args[p] = arguments[i];
                } else {
                    args[p] = "";
                }
            }
        }
    }

    var p;
    while(p = order.shift()) {
        args[p] = "";
    }

    if(callback) {
        this.on('response', callback);
    }

    this.create(args);
}

util.inherits(Ghostbin, EventEmitter);

Ghostbin.prototype.create = function(args) {
    this.jar = request.jar();
    this.request = request.defaults({
        jar: this.jar
    });
    var self = this;
    request({
        url: 'https://ghostbin.com/paste/new',
        method: 'post',
        formData: args,
        followRedirect: function(response) {
            return false;
        }
    }, function(err, response, body) {
        self.emit('response', err, response.headers.location);
    });
};
