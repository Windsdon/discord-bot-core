"use strict";

var request = require('request');
var logger = require('winston');
var path = require('path');
var fs = require('fs');
var EventEmitter = require('events');
var Twitter = require('twitter');
var moment = require("moment");

var regex = /(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?/ig
function sanitizeData(data){
    return data.replace(regex, x => '<' + x + '>');
}

var client = null;

function createClient(info) {
    if(info) {
        client = new Twitter(info);
    }
}

function init(e, callback) {
    var p = path.join(e.db.getStoragePath("twitter"), "/credentials.json");

    var commands = [
        {
            help: "Watches an user or search on twitter. Supports: @user, anything else to search"
        },
        {
            stack: "ratelimit",
            permissions: ["ratelimit"],
            action: function(e) {
                if(client) {
                    client.get("application/rate_limit_status", function(err, data) {
                        if(data.resources) {
                            var calls = "";
                            calls += "/statuses/user_timeline: " + data.resources.statuses["/statuses/user_timeline"].remaining;
                            calls += ". Resets " + moment(new Date(data.resources.statuses["/statuses/user_timeline"].reset * 1000)).fromNow() + "\n";
                            calls += "/search/tweets: " + data.resources.search["/search/tweets"].remaining;
                            calls += ". Resets " + moment(new Date(data.resources.search["/search/tweets"].reset * 1000)).fromNow() + "\n";;
                            e.respond("Remaining API calls:\n" + calls);
                        }
                    });
                }
            }
        }
    ]

    try {
        var info = JSON.parse(fs.readFileSync(p));
        if(!info.consumer_key || !info.consumer_secret) {
            return callback(new Error("Fields not present: consumer_key or consumer_secret on " + p));
        }
        if(info.bearer_token) {
            createClient(info);
            return callback(null, commands);
        }

        var auth = "Basic " + new Buffer(encodeURIComponent(info.consumer_key) + ":" + encodeURIComponent(info.consumer_secret)).toString('base64');

        request.post({
            url: "https://api.twitter.com/oauth2/token",
            headers: {
                "User-Agent": "Watchbot v0.1",
                Authorization: auth,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "Content-Length": 29
            },
            body: "grant_type=client_credentials"
        }, function(err, res, body) {
            if(err) {
                return callback(err);
            }
            var token = JSON.parse(body);
            if(token.access_token) {
                info.bearer_token = token.access_token;
                createClient(info);
                fs.writeFileSync(p, JSON.stringify(info, null, 4));
                logger.debug("Created access token");
                return callback(null, commands);
            } else {
                return callback(new Error("Cannot fetch bearer_token. Please check your details."));
            }
        })
    } catch(err) {
        fs.writeFileSync(p, JSON.stringify({
            consumer_key: "",
            consumer_secret: ""
        }, null, 4));

        callback(new Error("Cannot find auth file: " + p + ". Created one for you. Please fill in the details."));
    }
}

class TwitterWatcher extends EventEmitter {
    constructor(args, callback) {
        super();
        logger.debug("Create watch", args.twitter);

        this.args = args;
        this.lookup(true);
        var self = this;
        this.interval = setInterval(this.lookup.bind(this), args.interval * 1000);
        callback(null, this);
    }

    lookup(initial) {
        var self = this;
        if(!initial) {
            this.args.twitter.since_id = this.id_str;
        }
        if(this.args.twitter.screen_name) {
            client.get('statuses/user_timeline', this.args.twitter, function(error, tweets, response) {
                if(tweets.errors) {
                    logger.error(tweets.errors);
                    return;
                }
                if(tweets && tweets.length) {
                    if(initial) {
                        self.id_str = tweets[0].id_str;
                        return;
                    }
                    tweets.forEach(function(v) {
                        self.id_str = v.id_str;

                        var media = "";
                        if(v.entities.media) {
                            media = "\n\n";
                            v.entities.media.forEach(m => {
                                media += m.media_url + " "
                            });
                        }

                        self.emit("update", {
                            when: (new Date(v.created_at).toISOString()),
                            what: `**Tweet by ${v.user.name} _@${v.user.screen_name}_**\n\`\`\`\n${sanitizeData(v.text)}\n\`\`\`\nPermalink: <https://twitter.com/${v.user.screen_name}/status/${v.id_str}> ${media}`
                        });
                    });
                }

            });
        } else {
            client.get('search/tweets', this.args.twitter, function(error, tweets, response) {
                if(tweets.errors) {
                    logger.error(tweets.errors);
                    return;
                }
                if(tweets.statuses && tweets.statuses[0]) {
                    if(initial) {
                        self.id_str = tweets.statuses[0].id_str;
                        return;
                    }

                    tweets.statuses.forEach(function(v) {
                        self.id_str = v.id_str;

                        var media = "";
                        if(v.entities.media) {
                            media = "\n\n";
                            v.entities.media.forEach(m => {
                                media += m.media_url + " "
                            });
                        }

                        self.emit("update", {
                            when: (new Date(v.created_at).toISOString()),
                            what: `**Tweet by ${v.user.name} _@${v.user.screen_name}_** (search: ${self.args.twitter.q})\n\`\`\`\n${sanitizeData(v.text)}\n\`\`\`\nPermalink: <https://twitter.com/${v.user.screen_name}/status/${v.id_str}> ${media}`
                        });
                    });
                }
            });
        }
    }

    stop() {
        clearInterval(this.interval)
    }
}

class TwitterWatcherHandler {
    constructor(e) {

    }

    /**
    called when a watcher is enabled
    should return a promise
    args: {
        id: string, // unique id of this watcher, used to remove it
        uid: string, // who created this watcher
        subject: string, // what to watch, in this case `?@user`? or anything else to search
        args: object || null, // the extra params
        notify: string || null, // uid to ping when updates happen
        interval: number // how frequently to check, in seconds
    }
    .catch(err)
    .then({watcher: watcher, save: obj})
    watcher: EventEmitter
        this object should emit("event", data) when something happens
        data: {
            when: string, // ISO timestamp
            what: string, // contents of this event
            who: string || null, // uid if this is about a discord user
            notify: string || null, // uid of someone to notify via pm about this
                                    // if set, this will stop the normal message
            attachments: array // list of file names to send after the message
        }
    save: modified args object that will be saved to the db
    **/
    watch(e, args) {
        return new Promise(function(resolve, reject) {
            if(!args._twitter) {
                var o;
                if(o = args.subject.match(/`?@(\w+)`?/)) {
                    args.twitter = {
                        screen_name: o[1],
                        include_rts: 1,
                        count: 5
                    };
                } else {
                    args.twitter = {
                        q: args.subject,
                        count: 5
                    };
                }
            }

            try {
                var watcher = new TwitterWatcher(args, function(err, self) {
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
    construct: TwitterWatcherHandler,
    init: init
}
