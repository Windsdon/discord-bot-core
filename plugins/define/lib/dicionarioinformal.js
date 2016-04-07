var request = require("request");
var logger = require("winston");
var cheerio = require("cheerio");
var Iconv  = require('iconv').Iconv;
var Buffer = require('buffer').Buffer;

module.exports = scrape;

function scrape(str, callback) {
    var iconv = new Iconv('ISO-8859-1', 'UTF-8');
    request({
        url: "http://www.dicionarioinformal.com.br/" + str,
        headers: {
            'User-Agent': "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.109 Safari/537.36"
        },
        encoding: null
    }, function(err, response, body) {
        if(err) {
            callback(err);
            return;
        }


        body = iconv.convert(body, "ISO-8859-1").toString();

        // use cheerio to get a jquery object
        var $ = cheerio.load(body);

        var str = "";

        $(".card").each(function() {
            var $$ = $(this);

            // test if it's a valid card
            if($$.find("h3.di-blue").length == 0 ) {
                return;
            }

            var title = $$.children().first().children().first().text().trim();

            var definition = $$.find(".card-body p.text-justify").text().trim();

            var usage = $$.find(".card-body blockquote.text-justify").text().trim();

            str += `**${title}**\n${definition}\n*${usage}*\n\n`;
        });

        if(str.length == 0) {
            callback({
                message: "Couldn't find anything for " + str
            });
            return;
        }

        callback(null, {
            message: str
        });
    });
}
