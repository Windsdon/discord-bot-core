var logger = require("winston");
var async = require("async");
var fs = require("fs");
var request = require("request");
var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var minifyHTML = require('express-minify-html');
var path = require('path');
var nunjucks = require('nunjucks');
var router = express.Router();
var crypto = require("crypto");
var CryptoJS = require("crypto-js");

module.exports = {
    version: "1.3.2",
    name: "Emotes",
    author: "Windsdon",
    init: EmoteMod
}

var secret = crypto.randomBytes(256).toString('hex');

function EmoteMod(e, callback) {
    e._disco.addCommandHandler(async.apply(emotesHandler, e), "start");

    e.register.addCommand(["emote", "add"], ["emote.config.add"], [
        {
            id: "id",
            type: "string",
            required: true,
            options: {
                validation: /^\w+$/
            }
        },
        {
            id: "url",
            type: "string",
            required: true
        }
    ], emoteAdd, "Add a new emote");

    e.register.addCommand(["emote", "remove"], ["emote.config.remove"], [
        {
            id: "id",
            type: "string",
            required: true
        }
    ], emoteRemove, "Remove an emote");

    e.register.addCommand(["emote"], ["emote.list"], [], emoteList, "List emotes");

    e.register.addCommand(["emote", "port"], ["emote.port"], [
        {
            type: "number",
            id: "port"
        }
    ], emotePort, "Set web interface port");

    e.register.addCommand(["emote", "url"], ["emote.url"], [
        {
            type: "string",
            id: "url"
        }
    ], emoteURL, "Set web interface base url");

    e.register.addCommand(["emote", "enable"], ["emote.config.enable"], [], emoteEnable, "Enable emote parsing");
    e.register.addCommand(["emote", "disable"], ["emote.config.disable"], [], emoteDisable, "Disable emote parsing");

    var self = this;

    var config = e.db.getDatabase("emotes_config");

    config.find({
        id: "baseurl"
    }, function(err, data) {
        if(err || !data.length) {
            logger.error("Can't open web interface: no base url defined!");
            callback();
            return;
        }
        var baseURL = data[0].value;
        config.find({
            id: "port"
        }, function(err, data) {
            if(err || !data.length) {
                logger.error("Can't open web interface: no port defined!");
                callback();
                return;
            } else {
                var port = data[0].value;
                self.url = baseURL + ":" + port
                var app = express();
                self.app = app;
                var p = path.join(__dirname, 'views');
                app.set('views', p);

                nunjucks.configure(app.get('views'), {
                    autoescape: true,
                    express: app,
                    noCache: true,
                    tags: {
                        variableStart: '<$',
                        variableEnd: '$>',
                    }
                });

                app.use(bodyParser.json());
                app.use(bodyParser.urlencoded({ extended: false }));
                app.use(cookieParser());

                app.use(function(req, res, next) {
                    req.mod = self;
                    req.e = e;
                    req.baseURL = baseURL + ":" + port;
                    next();
                });

                app.use(minifyHTML({
                    override:      true,
                    htmlMinifier: {
                        removeComments:            true,
                        collapseWhitespace:        true,
                        collapseBooleanAttributes: true,
                        removeAttributeQuotes:     true,
                        removeEmptyAttributes:     true,
                        minifyJS:                  true
                    }
                }));

                router.get('/emotes/:server', webServer);
                router.get("/image/:server/:hash/:file", webImage);
                app.use('/', router);

                app.use(express.static(path.join(__dirname, 'public')));

                var listener = app.listen(data[0].value, function (err) {
                    if(err) {
                        logger.error(err);
                        callback();
                        return;
                    }
                    logger.debug('Listening on ' + listener.address().port);
                    callback();
                });
            }
        });
    });
}

function makeHash(server, file) {
    return CryptoJS.HmacSHA256(server + file, secret);
}

function webServer(req, res, next) {
    var server = req.e._disco.bot.servers[req.params.server];
    if(!server) {
        res.end();
        return;
    }

    var dbEmotes = req.e.db.getDatabase("emotes", req.params.server);

    dbEmotes.find({
        id: {
            $exists: true
        }
    }, function(err, data) {
        if(err) {
            logger.error(err);
            return res.end();
        }

        if(data.length == 0) {
            res.render('empty.html');
            return;
        }

        var list = [];
        data.forEach(function(v, i) {
            list.push({
                id: v.id,
                file: `${req.baseURL}/image/${req.params.server}/${makeHash(req.params.server, v.filename)}/${v.filename}`
            });
        });

        list.sort(function (a, b) {
            return a.id.toLowerCase().localeCompare(b.id.toLowerCase());
        });

        res.render('index.html', {
            title: 'Emotes on server ' + server.name,
            serverName: server.name,
            elements: list
        });
    });
}

function webImage(req, res) {
    if(!req.e._disco.bot.servers[req.params.server] || req.params.hash != makeHash(req.params.server, req.params.file)) {
        res.end();
        return;
    }

    var p = path.resolve(path.join(req.e.db.getStoragePath("emotes", req.params.server),  req.params.file));
    res.sendFile(p);
}

function makeLog(o, list) {
    return `**${o.user}** on channel <#${o.channelID}> generated emotes ${list.join(", ")}`;
}

// emotes db:
// id, filename OR config, value
function emotesHandler(e, o, callback) {
    if(o.directives.disableChilds) {
        return callback();
    }

    var dbEmotes = e.db.getDatabase("emotes", o.serverID);
    var path = e.db.getStoragePath("emotes", o.serverID);

    // parse aliases
    dbEmotes.find({
        config: "enable"
    }, function(err, data) {
        if(err) {
            logger.error(err);
            return;
        }

        if(data.length == 0 || !data[0].value) {
            return;
        }

        var list = o.message.match(/:\w+:/gi);

        if(!list) {
            return;
        }

        var files = [];
        var msgEmotes = [];

        async.forEachOf(list, function(v, i, cb) {
            dbEmotes.find({
                id: v.substring(1, v.length - 1)
            }, function(err, data) {
                if(err) {
                    logger.error(err);
                    cb(); //ignore errors
                    return;
                }
                if(data.length != 0) {
                    if(msgEmotes.indexOf(data[0].id) == -1) {
                        msgEmotes.push(data[0].id);
                        try {
                            var f = fs.createReadStream(path + "/" + data[0].filename);
                            files.push(f);
                        } catch(err) {
                            logger.error(err);
                        }
                    }
                }
                cb();
            });
        }, function(err) {
            if(!err) {
                if(msgEmotes.length != 0) {
                    e._disco.logOnChannel(makeLog(o, msgEmotes))
                }
                files.forEach(function(v) {
                    e._disco.queueFile(o.channelID, v);
                });
            }
        });
    });


    callback(null);
}

function emotePort(e, args) {
    if(args.port < 1024 || args.port > 49151) {
        e.mention().respond("That port is invalid!");
        return;
    }

    var config = e.db.getDatabase("emotes_config");
    config.update({
        id: "port"
    }, {
        id: "port",
        value: args.port
    }, {upsert: true}, function(err) {
        if(err) {
            logger.error(err);
            e.code(err.message);
        } else {
            e.respond(`Web interface port set to: ${args.port}. Restart the bot to use.`);
        }
    })
}

function emoteURL(e, args) {
    var config = e.db.getDatabase("emotes_config");
    config.update({
        id: "baseurl"
    }, {
        id: "baseurl",
        value: args.url
    }, {upsert: true}, function(err) {
        if(err) {
            logger.error(err);
            e.code(err.message);
        } else {
            e.respond(`Web interface base url set to: ${args.url}. Restart the bot to use.`);
        }
    })
}

function emoteAdd(e, args) {
    var dbEmotes = e.db.getDatabase("emotes", e.serverID);
    dbEmotes.ensureIndex({ fieldName: 'id', unique: true });

    (new Promise(function(resolve, reject) {
        dbEmotes.find({
            id: args.id
        }, function(err, data) {
            if(err || data.length > 0) {
                reject();
            } else {
                resolve();
            }
        })
    })).then(function() {
        var path = e.db.getStoragePath("emotes", e.serverID);
        var ext = "png";
        if(/\.gif$/.test(args.url)) {
            ext = "gif";
        } else if(/\.jpg$/.test(args.url)) {
            ext = "jpg";
        }
        var fname = args.id + "." + ext;
        var fpath = path + "/" + fname;
        var stream = request(args.url).on('response', function(response) {
            if(response.statusCode != 200) {
                e.mention().respond("That link is invalid - Status Code: " + response.statusCode);
            } else if(!response.headers['content-type'].match(/image\/(png|gif|jpg|jpeg)/)) {
                e.text("Invalid content-type:").code(response.headers['content-type']).respond();
            } else if(response.headers['content-length']/(1024 * 1024) > 1 ) {
                e.respond(`That file is too big (${response.headers['content-length']/(1024 * 1024)} MB)!`);
            } else {
                stream.pipe(fs.createWriteStream(fpath)).on('finish', function () {
                    dbEmotes.insert({
                        uid: e.userID,
                        id: args.id,
                        filename: fname
                    }, function(err, data) {
                        e.mention().respond("Emote added!");
                    });
                });
            }
        }).on('error', function(err) {
            logger.error(err);
            e.code(err.message);
        });
    }).catch(function() {
        e.respond("That emote already exists!");
    });
}

function emoteRemove(e, args) {
    var dbEmotes = e.db.getDatabase("emotes", e.serverID);
    dbEmotes.remove({
        id: args.id
    },{}, function(err, numRemoved) {
        e.mention().respond("Emote removed!");
    });
}

function emoteList(e, args) {
    var dbEmotes = e.db.getDatabase("emotes", e.serverID);
    dbEmotes.find({
        id: {
            $exists: true
        }
    }, function(err, data) {
        if(err) {
            logger.error(err);
            e.code(err.message).respond();
            return;
        }
        if(data.length == 0) {
            e.mention().respond("No emotes here!");
            return;
        }

        var list = [];
        data.forEach(function(v, i) {
            list.push(v.id);
        });

        list.sort(function (a, b) {
            return a.toLowerCase().localeCompare(b.toLowerCase());
        });

        e.respond("**List of emotes**\n" + (e.mod.url ? e.mod.url + "/emotes/" + e.serverID + "\n": "") + "Or check your PMs for the list.");
        e.text("**List of emotes**: \n\n" + list.join(", ")).pm();
    });
}

function emoteEnable(e, args) {
    var dbAlias = e.db.getDatabase("emotes", e.serverID);

    _emoteSetEnable(dbAlias, true, function (err, numReplaced, upsert) {
        if(err) {
            logger.error(err);
        } else {
            e.mention().respond("Enabled emote parsing");
        }
    });
}

function emoteDisable(e, args) {
    var dbAlias = e.db.getDatabase("emotes", e.serverID);

    _emoteSetEnable(dbAlias, false, function (err, numReplaced, upsert) {
        if(err) {
            logger.error(err);
        } else {
            e.mention().respond("Disabled emote parsing");
        }
    });
}

function _emoteSetEnable(db, value, cb) {
    db.update({
        config: "enable"
    }, {
        $set: {
            value: value
        }
    }, { upsert: true }, cb);
}
