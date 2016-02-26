var request = require('request');
var logger = require("winston");

module.exports = {
    version: "1.0.0",
    name: "e621 grabber",
    author: "Windsdon and Zephy",
    init: e621Mod
}


function e621Mod(e, callback) {
    e.register.addCommand(["furry"], ["e621Grab.grab"], [{
        id: "tags",
        type: "multistr",
        required: true
    }], e621Grab, "Get a furry!");

    callback();
}

function getJson(url, callback) {
    var headers = {
        'User-Agent':       'CC discord chat client.',
        'Content-Type':     'application/x-www-form-urlencoded'
    }

    // Configure the request
    var options = {
        url: url,
        method: 'GET',
        headers: headers,
        json: true
    }

    request(options, function (err, res, body) {
        if(err) return (callback && callback(err, null));
        if (!err && res.statusCode == 200) {
            return (callback && callback(null, body));
        }
        logger.warn(">>> e621 Not 200 response: " + res.statusCode)
        return (callback && callback("Not 200 response", null));
    });
}

function e621Grab(e, args) {
    var nsfw = false; // no nsfw for now xD
    var tags = args.tags.join(" ");
    if(!nsfw) {
        tags = tags.replace(/(\+|-)?rating:\w*/gi, '') + " rating:s"
    }
    var url = "https://e621.net/post/index.json?tags=" + encodeURIComponent(tags);

    getJson(url, function (err, res) {
        if (err) return (logger.error("[e621]_SCRAPE_ERROR: " + err));
        if(res && res[0]){
            var random = res[Math.floor(Math.random() * res.length)];
            var str = "I found a match for the tags **" + tags + "**:\n";

            e.mention().respond(str + "Permalink: \"https://e621.net/post/show/" + random.id + "\"\n\n" + random.file_url);
        }else{
            e.mention().respond("I can't find anything with these tags!");
        }
    });
}
