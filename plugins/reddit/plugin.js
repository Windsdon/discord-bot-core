var https = require("https");
var logger = require("winston");

module.exports = {
    version: "0.1.0",
    name: "Reddit",
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

    this.allowNSFW = true;

    callback();
}

function reddit(e, args) {
    if(!args.sub.match(/^[a-zA-Z0-9_\-]+$/)) {
        e.mention().respond(`**${args.sub} is not a valid subreddit**`);
        return;
    }
    logger.debug(args.nsfw, e.mod.allowNSFW);
    if(args.nsfw && !e.mod.allowNSFW) {
        e.mention().respond(`**NSFW mode is disabled**`);
        return;
    }
    https.get({
        hostname: "api.reddit.com",
        path: "/r/" + args.sub + "?limit=50",
        headers: {
            "User-Agent": "node:discord-reddit-mod:v0.1.0"
        }
    }, function(res) {
        logger.debug(`Got response: ${res.statusCode}`);
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
