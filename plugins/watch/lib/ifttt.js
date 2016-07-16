"use strict";

var request = require('request');
var logger = require('winston');
var path = require('path');
var fs = require('fs');
var EventEmitter = require('events');
var moment = require("moment");
var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var crypto = require('crypto');

var app;
var url;
var emitter = new EventEmitter();

function init(e, callback) {
    var commands = [
        {
            help: "IFTTT Maker channel updates."
        }
    ];

    var p = path.join(e.db.getStoragePath("ifttt"), "/config.json");

    try {
        var info = JSON.parse(fs.readFileSync(p));
        var baseURL = info.baseURL;
        var port = info.port;

        if(!baseURL || !port) {
            throw(new Error("Invalid values"));
        }

        url = baseURL + ":" + port;
        app = express();

        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(cookieParser());

        app.post("/watch/ifttt/:channel", function(req, res) {
            emitter.emit("post", {
                channel: req.params.channel,
                data: req.body
            });
            res.status(200);
            res.end();
        });

        var listener = app.listen(port, function (err) {
            if(err) {
                callback(err);
                return;
            }

            logger.debug('Listening on ' + listener.address().port);
            e._disco.logOnChannel('Listening on ' + url);

            callback(null, commands);
        });
    } catch (err) {
        fs.writeFileSync(p, JSON.stringify({
            baseURL: "",
            port: ""
        }, null, 4));
        err.message = "Can't open web interface: no base url or port defined! [IFTTT] - " + err.message;
        e._disco.logOnChannel(err.message);
        callback(err);
        return;
    }
}

class IFTTTWatcher extends EventEmitter {
    constructor(args, callback) {
        super();
        var self = this;
        self.args = args;
        self.listener = self.update.bind(self);
        emitter.on("post", self.listener);
        callback(null, self);
    }

    update(e) {
        if(e.channel = this.args.ifttt.channel) {
            if(e.data.key == this.args.ifttt.key) {
                this.emit("update", {
                    what: `${e.data.when} [${e.channel}] ${e.data.author ? '**' + e.data.author + '**' : ""} ${e.data.title ? '_' + e.data.title + '_' : ""}\n\n${e.data.content}`,
                    when: (new Date()).toISOString()
                });
            }
        }
    }

    stop() {
        emitter.removeListener("post", this.listener);
    }
}


class IFTTTWatcherHandler {
    constructor(e) {

    }

    watch(e, args) {
        return new Promise(function(resolve, reject) {
            if(!args.ifttt) {
                args.ifttt = {
                    key: crypto.randomBytes(32).toString('hex'),
                    channel: args.subject
                }

                e.pm(`The url for your IFTTT recipe is ${url}/watch/ifttt/${args.ifttt.channel}\nThe key is \`${args.ifttt.key}\`. You'll only see this once.`);
            }

            var watcher = new IFTTTWatcher(args, function(err, self) {
                if(err) {
                    reject(err);
                } else {
                    resolve({
                        watcher: self,
                        save: args
                    });
                }
            });
        });
    }
}

module.exports = {
    construct: IFTTTWatcherHandler,
    init: init
}
