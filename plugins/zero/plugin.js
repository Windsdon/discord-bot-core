var request = require("request");
var logger = require("winston");
var cheerio = require("cheerio");
var Iconv = require('iconv').Iconv;
var Buffer = require('buffer').Buffer;
var fs = require("fs");

module.exports = {
	version: "1.0.1",
	name: "Zerochan scrapper",
	author: "Windsdon",
	init: ZeroMod
}

function ZeroMod(e, callback) {
	e.register.addCommand(["zero"], ["zero.grab"], [
		{
			id: "name",
			type: "string",
			required: "true"
		}
	], zeroGrab, "Grab an image from Zerochan.net", {
			cooldown: 30
		});

	callback();
}

function zeroGrab(e, args) {
	var name = args.name.replace(/ +/gi, "+");

	// returns a all images on a page
	// solves redirects automatically
	function getPage(url, callback) {
		logger.debug("get " + url);
		callback = callback || function () { };
		request(url, function (err, response, body) {
			try {
				if (err) {
					callback(err);
					return;
				}

				// use cheerio to get a jquery object
				var $ = cheerio.load(body);

				if ($("#children").length != 0) { // results page
					var path = $("#children").find("li").first().find("a").first().attr("href");
					logger.debug(`${url} redirects to ${path}`);
					e.mention().respond(`Assuming ${args.name} refers to ${decodeURIComponent(path.replace(/\//g, '').replace(/\+/g, ' '))}`);
					getPage("http://zerochan.net" + path, callback);
					return;
				}

				if ($("#thumbs2").length != 0) {
					if ($("p.pagination").length != 0 && url.indexOf("?") == -1) { // see if we have multiple pages
						var k = $("p.pagination").text().match(/[0-9]+ +of +([0-9]+)/i);
						if (k) {
							// get a random page
							getPage(url + "?p=" + Math.min(Math.floor(Math.random() * (k[1] - 1) + 1), 100), callback);
							return;
						}
					}

					var list = [];
					$("#thumbs2").find("img").each(function () {
						var fullurl = $(this).attr("src").replace(/s3\./, "static.").replace(/\.240\./, ".full.");
						list.push({
							url: fullurl
						});
					});

					logger.debug(JSON.stringify(list));
				}

				callback(null, {
					list: list
				});
			} catch (e) {
				callback(e);
			}

		});
	}

	getPage("http://www.zerochan.net/search?q=" + name, function (err, o) {
		if (err) {
			e.respond("Failed to do that:\n```\n" + err.message + "\n```");
			return;
		}
		if (o.list && o.list.length != 0) {
			e.mention().respond("Here is a picture of **" + args.name + "**:\n" + o.list[Math.floor(Math.random() * o.list.length)].url);
		} else {
			e.mention().respond("I can't find any images of **" + args.name + "** :(");
		}
	});
}
