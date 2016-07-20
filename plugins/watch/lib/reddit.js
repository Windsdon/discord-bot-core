"use strict";

var request = require('request');
var logger = require('winston');
var path = require('path');
var fs = require('fs');
var EventEmitter = require('events');
var moment = require("moment");
var WebSocket = require('ws');


function init(e, callback) {
    var commands = [
        {
            help: "Reddit updates. what=r/something or live/something"
        }
    ];

    callback(null, commands);
}

class RedditLiveWatcher extends EventEmitter {
    constructor(args, callback) {
        super();
        var self = this;
        self.args = args;
        request.get("https://www.reddit.com/live/" + args.reddit.live + "/about.json", function(err, response, body) {
            try {
                var info = JSON.parse(body);
                if(info.error) {
                    return callback(info);
                }

                self.register(info.data.websocket_url);
                callback(null, self);
            } catch(err) {
                callback(err);
            }
        });
    }

    register(url) {
        var self = this;

        self.ws = new WebSocket(url);

        self.ws.on('message', function(data, flags) {
            self.handle(data);
        });

        self.ws.on('close', function() {
            if(!self.disable) {
                self.register(url);
            }
        })
    }

    stop() {
        this.disable = true;
        this.ws.close();
    }

    handle(data) {
        data = JSON.parse(data);
        if(data.type == "update") {
            var d = data.payload.data;
            var date = new Date(d.created_utc * 1000);
            this.emit("update", {
                what: `${moment(date).format()} **/u/${d.author}** <https://www.reddit.com/live/${this.args.reddit.live}> \n\n${d.body}`,
                when: date.toISOString()
            });
        }
    }
}

class RedditSubWatcher extends EventEmitter {
    constructor(args, callback) {
        super();
        var self = this;
        this.args = args;
        this.interval = setInterval(this.lookup.bind(this), args.interval * 1000);
        this.lookup(true);
        callback(null, this);
    }

    lookup(initial) {
        var self = this;
        request.get({
            url: "https://api.reddit.com/r/" + self.args.reddit.r + "/new?limit=10" + (!initial ? "&before=" + this.name : ""),
            headers: {
                "User-Agent": "node:discord-reddit-watch:v0.1.0"
            }
        }, function(err, res, body) {
            try {
                body = JSON.parse(body);
            } catch(err) {
                logger.debug(body);
                logger.error(err);
                return;
            }

            if(!body || !body.data) {
                return;
            }

            if(body.data.children.length) {
                self.name = body.data.children[0].data.name;
                logger.debug(self.name + " on " + body.data.children[0].data.subreddit);
                if(initial) {
                    return;
                }

                body.data.children.forEach(v => {
                    var embedded = "";
                    if(v.data.preview && v.data.preview.images) {
                        embedded = "\n\n";
                        v.data.preview.images.forEach(k => {
                            embedded += k.source.url + " ";
                        });
                    }

                    var date = new Date(v.data.created_utc * 1000);

                    self.emit("update", {
                        what: `${moment(date).format()} /r/${v.data.subreddit} **/u/${v.data.author}** <https://www.reddit.com${v.data.permalink}>\n\n**${v.data.title}**\n${v.data.selftext}${embedded}`,
                        when: date.toISOString()
                    });
                });
            } else {
                request("https://api.reddit.com/by_id/" + self.name, function(err, res, body) {
                    try {
                        body = JSON.parse(body);
                    } catch(err) {
                        logger.debug(body);
                        logger.error(err);
                        return;
                    }

                    if(!body || body.error) {
                        lookup(true);
                    }
                })
            }
        });
    }

    stop() {
        clearInterval(this.interval);
    }
}

class RedditWatcherHandler {
    constructor(e) {

    }

    watch(e, args) {
        return new Promise(function(resolve, reject) {
            if(!args.reddit) {
                var o;
                if(o = args.subject.match(/^\/?r\/(\w+)/)) {
                    args.reddit = {
                        r: o[1]
                    }
                } else if(o = args.subject.match(/^\/?live\/(\w+)/)) {
                    args.reddit = {
                        live: o[1]
                    }
                } else {
                    return reject(new Error("You need to match r/stuff or live/stuff"));
                }
            }

            try {
                var c = args.reddit.live ? RedditLiveWatcher : RedditSubWatcher;
                var watcher = new c(args, function(err, self) {
                    if(err) {
                        reject(err);
                    } else {
                        resolve({
                            watcher: self,
                            save: args
                        });
                    }
                });
            } catch(err) {
                reject(err);
            }
        });
    }
}

module.exports = {
    construct: RedditWatcherHandler,
    init: init
}
