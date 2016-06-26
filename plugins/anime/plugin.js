var request = require('request');
var logger = require('winston');

module.exports = {
    version: "0.1.1",
    name: "Anime Search",
    author: "Windsdon",
    init: AnimeMod
}

function AnimeMod(e, callback) {
    e.register.addCommand(["anime"], ["anime.search"], [
        {
            id: "type",
            type: "choice",
            required: false,
            options: {
                list: ["char", "anime", "manga", "all"]
            }
        },
        {
            id: "query",
            type: "rest",
            required: true
        }
    ], animeSearch, "Sarch animes and characters");

    callback();
}

function animeSearch(e, args) {
    var type = "anime";

    if(args.type) {
        switch(args.type) {
            case "char":
                type = "character"
                break;
            default:
                type = args.type;
        }
    }

    function postAnime(humming) {
        e.text(`**${humming.title}**\n\n`);
        if(humming.alternate_title) {
            e.text(`**Alternate title:** ${humming.alternate_title}\n`);
        }
        e.text(`**Episodes:** ${humming.episode_count}\n`);
        e.text(`**Synopsis:** ${humming.synopsis}\n`);
        e.text(`**Started:** ${humming.started_airing}\n`);
        e.text(`**Finished:** ${humming.finished_airing}\n`);

        var genres = [];

        humming.genres.forEach(function(v) {
            genres.push(v.name);
        });

        e.text(`**Genres:** ${genres.join(", ")}\n\n`);

        e.text(humming.cover_image);
        e.respond();
    }

    function postMal(mal) {
        e.text(`**${mal.name}**\n\n`);
        e.text(`**URL:** <${mal.url}>\n`);
        e.text(`${mal.image_url}\n`);
        e.respond();
    }

    function humming(query) {
        hummingSearch(query, function(err, list) {
            if(err || list.length == 0) {
                logger.error(err);
                return e.mention().respond("I can't find anything!");
            }

            if(list.length == 1) {
                return postAnime(list[0]);
            } else {
                var l = [];
                for(var i = 0; i < list.length; i++) {
                    l.push("" + (i + 1));
                }

                e.text("I found these:\n\n");

                list.forEach(function(v, i) {
                    e.text(`**${i + 1}**: _${v.title}_\n`);
                });

                e.respond("\n\n**Which one?** Send a message with the number you want more info on.");
                e.expect([
                    {
                        id: "i",
                        type: "choice",
                        required: true,
                        options: {
                            list: l
                        }
                    }
                ]).then(function(args) {
                    postAnime(list[args.i - 1]);
                }).catch(function(err) {
                    e.mention().respond("That option is invalid!");
                });
            }
        });
    }

    if(type == "anime") { // search from Hummingbird
        humming(args.query);
    } else { // search from MaL
        malSearch(type, args.query, function(err, list) {
            if(err || list.length == 0) {
                logger.error(err);
                return e.mention().respond("I can't find anything!");
            }

            if(list.length == 1) {
                if(list[0].type == "anime") {
                    return humming(list[0].title);
                } else {
                    return postMal(list[0]);
                }
            } else {
                var l = [];
                for(var i = 0; i < list.length; i++) {
                    l.push("" + (i + 1));
                }

                e.text("I found these:\n\n");

                list.forEach(function(v, i) {
                    if(v.type == "anime") {
                        e.text(`**${i + 1}**: _${v.name}_ (Anime)\n`);
                    } else if(v.type == "manga") {
                        e.text(`**${i + 1}**: _${v.name}_ (Manga)\n`);
                    } else if(v.type == "character") {
                        e.text(`**${i + 1}**: _${v.name}_ (Character) ${v.payload.related_works.join(", ")}\n`);
                    } else if(v.type == "person") {
                        e.text(`**${i + 1}**: _${v.name}_ (Person)\n`);
                    } else {
                        e.text(`**${i + 1}**: _${v.name}_\n`);
                    }
                });

                e.respond("\n\n**Which one?** Send a message with the number you want more info on.");
                e.expect([
                    {
                        id: "i",
                        type: "choice",
                        required: true,
                        options: {
                            list: l
                        }
                    }
                ]).then(function(args) {
                    var u = list[args.i - 1];
                    if(u.type == "anime") {
                        humming(u.name);
                    } else {
                        postMal(u);
                    }
                }).catch(function(err) {
                    e.mention().respond("That option is invalid!");
                });
            }

        });
    }
}

function malSearch(type, query, callback) {
    callback = callback || () => {};
    request.get("http://myanimelist.net/search/prefix.json", {
        qs: {
            type: type,
            keyword: query
        }
    }, function(err, response, body) {
        try {
            var r = JSON.parse(body);
            if(r.errors) {
                return callback(r.errors[0]);
            }

            var list = [];
            r.categories.forEach(v => {
                v.items.forEach(item => {
                    list.push(item);
                });
            });

            callback(null, list);
        } catch(err) {
            return callback(err);
        }
    });
}

function hummingSearch(query, callback) {
    callback = callback || () => {};

    request.get("http://hummingbird.me/api/v1/search/anime", {
        qs: {
            query: query
        }
    }, function(err, response, body) {
        try {
            var r = JSON.parse(body);
            if(r.error) {
                return callback(r);
            }

            callback(null, r);
        } catch(err) {
            return callback(err);
        }
    });
}
