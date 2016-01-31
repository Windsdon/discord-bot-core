var logger = require("winston");
var http = require('http');
var fs = require('fs');

module.exports = {
    version: "1.1.0",
    name: "Hearthstone Cards",
    author: "Windsdon, using HearthHead DB and images!",
    init: Hearthstone
}

function Hearthstone(e, callback) {
    e.register.addCommand(["hs"], ["hearthstone.search"], [
        {
            id: "search",
            type: "multistr",
            required: false
        }
    ], hsSearch, "Search for Hearthstone cards. Search is a RegExp.", {
        cooldown: 5
    });

    this.cards = require("./cards.json");
    this.maxListLength = 20;

    callback();
}

function averageStats(cardList) {
    var statList = [
        {
            id: "cost",
            name: "Cost"
        },
        {
            id: "health",
            name: "Health"
        },
        {
            id: "attack",
            name: "Attack"
        }
    ];

    var avg = [];
    for (var i = 0; i < statList.length; i++) {
        avg.push(0);
    }

    cardList.forEach(function(card, i) {
        statList.forEach(function(stat, k){
            if(!card[stat.id]) {
                return;
            }
            avg[k] = (avg[k] * i + card[stat.id]) / (i + 1);
        });
    });

    var str = "";

    avg.forEach(function(a, i) {
        str += `**${statList[i].name}:** ${a.toFixed(2)}\n`;
    });

    return str;
}

function hsSearch(e, args) {
    var list = [];
    var searchList = ["name", "description"];
    if(!args.search) {
        list = e.mod.cards;
    } else {
        var stop = false;
        e.mod.cards.forEach(function(card) {
            if(stop) {
                return;
            }
            args.search.forEach(function(s) {
                if(stop) {
                    return;
                }
                if(card.id == s) {
                    list = [card];
                    stop = true;
                    return;
                }
                var rx = new RegExp(s, 'gi');
                searchList.forEach(function(se) {
                    if(card[se] && rx.test(card[se])) {
                        list.push(card);
                    }
                });
            });
        });
    }

    if(list.length == 0) {
        e.mention().respond("I couldn't find any cards with that query!");
        return;
    }

    function downloadCard(card, path, callback) {
        logger.debug("Download to " + path);
        var stats = fs.stat(path, function(err, stats) {
            if(!err && stats.isFile()) {
                callback(null);
                return;
            }
            var file = fs.createWriteStream(path);
            var request = http.get("http://wow.zamimg.com/images/hearthstone/cards/enus/original/" + card.image + ".png", function(response) {
                if(response.statusCode != 200) {
                    e.respond("Failed to acquire the image.");
                    response.on('data', (chunk) => {});
                    return;
                }
                response.pipe(file);
            });
            request.on("close", function(response){
                callback(null);
            });
        });
    }

    if(list.length == 1) {
        var card = list[0];
        var path = e.db.getStoragePath("cards");
        var cardPath = path + "/" + card.image + ".png";
        e.respond(getCardDescription(card));
        downloadCard(card, cardPath, function(err) {
            if(err) {
                e.mention().respond(err.message);
                return;
            }

            e.respondFile(cardPath);
        });

        return;
    }

    function getCardDescription(card) {
        return `*#${card.id}* **${card.name}** [${card.cost}] ${card.attack ? "(" + card.attack + "/" + card.health + ")" : ""}\n${card.description}\n\n`;
    }

    e.text(`Total cards: ${list.length}\n`);
    if(list.length > e.mod.maxListLength) {
        e.text(`*That list is too long! Please make a more specific query!*\n`);
    } else {
        list.forEach(function(card) {
            e.text(getCardDescription(card));
        });
    }

    e.text("\n__Average stats__ \n" + averageStats(list));
    e.respond();
}
