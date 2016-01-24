var https = require("https");
var logger = require("winston");

module.exports = {
    version: "0.2.0",
    name: "Reddit Poster",
    author: "Windsdon",
    f: RedditMod
}

function RedditMod(e, callback) {
    e.register.addCommand(["reddit"], ["reddit.grab"], [
        {
            id: "sub",
            type: "string",
            required: true
        },
        {
            id: "nsfw",
            type: "choice",
            options: {
                list: ["nsfw"]
            },
            required: false
        }
    ], reddit, "Grab a random image from the frontpage of this subreddit", {
        cooldown: 10
    });

    e.register.addCommand(["reddit", "nsfw"], ["reddit.nsfw"], [
        {
            id: "nsfw",
            type: "choice",
            options: {
                list: ["status", "allow", "deny"]
            },
            required: true
        }
    ], redditNSFW, "Change NSFW settings");

    var db = e.db.getDatabase("settings");

    this.dbSettings = db;

    var self = this;
    db.find({
        id: "allowNSFW"
    }, function(err, data) {
        if(err) {
            throw err;
        }

        if(!data.length) {
            self.allowNSFW = false;
            db.insert({
                id: "allowNSFW",
                value: self.allowNSFW
            });
        } else {
            self.allowNSFW = data[0].value;
        }

        callback();
    })


}

function reddit(e, args) {
    if(!args.sub.match(/^[a-zA-Z0-9_\-]+$/)) {
        e.mention().respond(`**${args.sub} is not a valid subreddit**`);
        return;
    }
    if(args.nsfw && !e.mod.allowNSFW) {
        e.mention().respond(`**NSFW mode is disabled**`);
        return;
    }
    https.get({
        hostname: "api.reddit.com",
        path: "/r/" + args.sub + "?limit=100",
        headers: {
            "User-Agent": "node:discord-reddit-mod:v0.1.0"
        }
    }, function(res) {
        var body = '';
        res.on('data', function(chunk) {
            body += chunk;
        });
        res.on('end', function() {
            if(res.statusCode != 200) {
                e.mention().respond(`**/r/${args.sub} is not valid**`);
                return;
            }

            try {
                var response = JSON.parse(body);
            } catch(e) {
                e.mention().respond("**Error while parsing the api response**");
                return;
            }

            var posts = [];
            response.data.children.forEach(function(v) {
                v.data.url = v.data.url.replace(/\?.*$/i, ''); // stole this from Zephy
                if(!v.data) { // skip invalid
                    return;
                }
                if(v.data.over_18 && !args.nsfw) {
                    return;
                }
                if(/(\.png|\.jpg)$/.test(v.data.url)) {
                    posts.push({
                        url: v.data.url,
                        title: v.data.title
                    });
                }
            });

            if(posts.length == 0) {
                e.mention().respond(`**No suitable posts on /r/${args.sub}**`);
                return;
            }

            var post = posts[Math.floor(Math.random() * posts.length)];

            e.mention().respond(`Here is a post from **/r/${args.sub}**\nTitle: **${post.title}**\n${post.url}`);
        });
    }).on('error', function(err) {
        logger.error(`Got error: ${err.message}`);
    });
}

function redditNSFW(e, args) {
    if(args.nsfw == "status") {
        e.mention().respond(`Currently, NSFW mode is **${e.mod.allowNSFW ? "ENABLED" : "DISABLED"}**`);
    } else if(args.nsfw == "allow") {
        e.mod.setNSFW(true);
        e.mention().respond(`NSFW mode is now **enabled**`);
    } else {
        e.mod.setNSFW(false);
        e.mention().respond(`NSFW mode is now **disabled**`);
    }
}

RedditMod.prototype.setNSFW = function (nsfw, callback) {
    this.allowNSFW = nsfw;
    this.dbSettings.update({
        id: "allowNSFW"
    }, {
        $set: {
            value: nsfw
        }
    }, {}, callback);
};
