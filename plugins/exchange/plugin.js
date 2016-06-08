var request = require("request");
var logger = require("winston");
var fs = require('fs');

module.exports = {
    version: "1.0.0",
    name: "Currency Exchange",
    author: "Windsdon",
    init: ExchangeMod
}

function ExchangeMod(e, callback) {
    e.register.addCommand(["exchange"], ["exchange.convert"], [
        {
            id: "str",
            type: "rest",
            required: false
        }
    ], exchange, "Get information about exchange rates, or convert money.");

    this.list = null;
    this.lastUpdate = 0;
    this.rates = null;

    var self = this;

    var path = e.db.getStoragePath("key");

    try {
        this.key = fs.readFileSync(path + "/key");
        request("http://www.apilayer.net/api/list?access_key=" + this.key, function(err, response, body) {
            function error(message) {
                logger.error("Failed to setup exchange api: " + message);
            }

            if(err) {
                logger.error(err);
                return error(err.message);
            }

            try {
                var r = JSON.parse(body);
                if(!r.success) {
                    return error(r.error.info);
                }
                self.list = r.currencies;
            } catch(err) {
                error(err.message);
            }
        });
    } catch(e) {
        logger.error("You don't have a currencylayer.com access key! Exchange will NOT work!");
    }

    callback();
}

function exchange(e, args) {
    if(!e.mod.list || !e.mod.key) {
        e.respond("**Cannot fetch currency list**");
        return;
    }

    function printHelp() {
        return e.text("This command allows you to convert values between currencies, or get the current exchange rates.").n()
        .text("Possible usages:").n().n()
        .text("`exchange <base> [unity1[,unity2...]]` e.g., _exchange USD BRL,EUR_").n()
        .text("_Get name and current rates from **base** unity_").n().n()
        .text("`exchange <value> <base> [to|in|into] <unity>`").n()
        .text("_Convert from **base** to **unity**_").n().n()
        .text("**Available currencies:** " + Object.keys(e.mod.list).join(", "));
    }

    if(!args.str || args.str.trim().length == 0) {
        return printHelp().respond();
    }

    function parse(str) {
        str = str.trim();
        var curr = Object.keys(e.mod.list).join("|");
        var convert = new RegExp(`^([0-9]+[.,]?[0-9]*) *(${curr}) *(?:into|to|in)? *(${curr})`, "i");
        var info = new RegExp(`^(${curr}) *((?:,?(?:${curr}))+)?`, "i");
        var matches;

        if(matches = convert.exec(str)) {
            var value = 1.0 * matches[1].replace(",", ".");
            var f = matches[2].toUpperCase();
            var t = matches[3].toUpperCase();
            var rate = e.mod.rate["USD"+t]/e.mod.rate["USD"+f];
            e.text(`**${value}** ${f} (${e.mod.list[f]}) = **${value * rate}** ${t} (${e.mod.list[t]})`);
            e.respond();
        } else if(matches = info.exec(str)){
            var f = matches[1].toUpperCase();
            var to = matches[2];
            e.text(`**${f}**: ${e.mod.list[f]}\n\n`);
            if(to) {
                e.text(`1 ${f} =  \n`);
                to.split(",").forEach(function(v) {
                    var t = v.toUpperCase();
                    var rate = e.mod.rate["USD"+t]/e.mod.rate["USD"+f];
                    e.text(`${rate} **${t}** (${e.mod.list[t]})\n`);
                });
            }

            e.respond();
        } else {
            printHelp().respond();
        }
    }

    if((new Date()).getTime() - e.mod.lastUpdate > (60 * 60 * 1000) || !e.mod.rates) {
        request("http://www.apilayer.net/api/live?access_key=" + e.mod.key, function(err, res, body) {
            if(err) {
                e.respond("Cannot fetch rates: **" + err.message + "**");
                return;
            }

            try {
                var r = JSON.parse(body);
                if(!r.success) {
                    throw new Error(r.error.info);
                }

                e.mod.rate = r.quotes;
                e.mod.lastUpdate = (new Date()).getTime();
                parse(args.str);
            } catch(err) {
                e.respond("Cannot fetch rates: **" + err.message + "**");
            }
        });
    } else {
        parse(args.str);
    }
}
