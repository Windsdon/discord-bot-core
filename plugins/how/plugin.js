var request = require("request");
var logger = require("winston");
var cheerio = require("cheerio");
var fs = require("fs");

module.exports = {
    version: "1.0.0",
    name: "Wikihow search",
    author: "Windsdon",
    init: HowMod
}

function HowMod(e, callback) {
    e.register.addCommand(["how"], ["how"], [
        {
            id: "lang",
            type: "choice",
            required: false,
            options: {
                list: ["es", "pt", "it", "fr", "ru", "de", "zh", "nl", "cs", "id", "ja", "hi", "th", "ar", "ko"]
            }
        }, {
            id: "search",
            type: "rest",
            required: false
        }
    ], how, "Get weird things from wikihow.com");

    callback();
}

function getWikihowURL(path, lang) {
    url = `http://${lang ? lang + "." : ""}wikihow.com/${path}`;
    return new Promise(function(resolve, reject) {
        request(url, function(err, response, body) {
            try {
                if(err) {
                    throw err;
                }

                // use cheerio to get a jquery object
                var $ = cheerio.load(body);

                resolve($);
            } catch(err) {
                reject(err);
            }
        });
    });
}

function getRandomSearch(search, lang) {
    return new Promise(function(resolve, reject) {
        getWikihowURL("wikiHowTo?search=" + encodeURIComponent(search), lang)
        .catch(reject).then(function($) {
            try {
                var h = $(".result");
                h = h.eq(~~(Math.random() * h.length));
                var link = h.find(".result_link");
                var title = link.text();
                var url = link.attr('href').match(/wikihow\.com\/(.*)/)[1];

                getWikihowURL(url, lang).then(resolve, reject);
            } catch (err) {
                reject(err);
            }
        });
    });
}

function getRandomStep($) {

    try {
        var title = $(".firstHeading").text().match(/(?:wiki)?(.*)/)[1];
        var steps = $(".section.steps .steps_list_2>li");
        var step = steps.eq(~~(Math.random() * steps.length));
        var image = step.find(".whcdn").eq(0).data('src');
        var text = steps.eq(~~(Math.random() * steps.length)).find('.step').text();
    } catch (e) {
        return {
            error: e
        };
    }

    return {
        title: title,
        image: image,
        text: text
    };
}

function how(e, args) {
    function response($) {
        var step = getRandomStep($);
        if(step.error) {
            error(step.error);
            return;
        }

        e.respond(`**${step.title}**\n\n${step.text}\n${step.image}`);
    }

    function error(err) {
        e.respond("Failed to do that:\n```\n" + err.message + "\n```");
    }

    if(!args.search) {
        getWikihowURL('Special:Randomizer', args.lang).then(response, error);
    } else {
        getRandomSearch(args.search, args.lang).then(response, error);
    }
}
