var request = require("request");
var logger = require("winston");
var cheerio = require("cheerio");
var fs = require("fs");

module.exports = {
	version: "1.0.0",
	name: "Deviant Art scraper",
	author: "Windsdon",
	init: DeviantMod
}

function DeviantMod(e, callback) {
	e.register.addCommand(["da"], ["deviant.grab"], [
		{
			id: "name",
			type: "string",
			required: "true"
		}
	], deviantGrab, "Grab an image from DeviantArt", {
			cooldown: 15
		});

	callback();
}

function deviantGrab(e, args) {

	// returns a list of page urls that contain images
	function search(url, callback) {
		logger.debug("get " + url);
		callback = callback || function () { };
		request({
			url: url,
			headers: {
				'User-Agent': "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.109 Safari/537.36"
			}
		}, function (err, response, body) {
			try {
				if (err) {
					callback(err);
					return;
				}

				var u = JSON.parse(body);

				var valid = [];

				u.DiFi.response.calls[0].response.content.resources.forEach(function (v) {
					var $ = cheerio.load(v[2]);
					if (!/(fanart|manga|digital)/.test($("div.tt-a").first().attr("category"))) {
						return;
					}
					valid.push($("a.thumb").attr("href"));
				});

				callback(null, {
					list: valid
				});
			} catch (e) {
				logger.error(e);
				callback(e);
			}

		});
	}

	// returns the full image on that page
	function getPage(url, callback) {
		logger.debug("get " + url);
		callback = callback || function () { };

		request({
			url: url,
			headers: {
				'User-Agent': "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.109 Safari/537.36"
			}
		}, function (err, response, body) {
			try {
				if (err) {
					callback(err);
					return;
				}

				var $ = cheerio.load(body);
				var image = $("div.dev-view-deviation img.dev-content-normal").attr("src");

				callback(null, {
					image: image
				});
			} catch (e) {
				logger.error(e);
				callback(e);
			}

		});
	}

	function getList(name, offset, callback) {
		var url = "http://www.deviantart.com/global/difi/?c%5B%5D=%22PortalCore%22%2C%22get_result_thumbs%22%2C%5B%22browse%22%2C%7B%22freeform_user_input%22%3A%22" + name + "%22%2C%22offset%22%3A%22" + offset + "%22%2C%22length%22%3A%221%22%2C%22mature_filter%22%3A%221%22%2C%22view_mode%22%3A%22thumb%22%2C%22thumb_mode%22%3A%22wall%22%2C%22is_mobile%22%3A%220%22%2C%22is_frontpage%22%3A%220%22%2C%22order%22%3A%229%22%7D%5D&pid=561m8c380e97275b89162471bc50e542a8a3&iid=561mcf78fe2f0d1abffb9eaa8b51b5a76075-iklov1fl-1.2&t=json"
		search(url, function (err, results) {
			if (err) {
				callback(err);
				return;
			}

			if (results.list && results.list.length != 0) {
				var page = results.list[Math.floor(Math.random() * results.list.length)];
				getPage(page, function (err, results) {
					if (err) {
						callback(err);
						return;
					}

					if (!results.image) {
						callback(null, {
							list: []
						});
					} else {
						callback(null, {
							list: [{
								url: results.image
							}]
						});
					}
				});
			} else {
				callback(null, {
					list: []
				})
			}
		});
	}

	var name = encodeURIComponent(args.name);
	var offset = Math.floor(Math.random() * 50);


	getList(name, offset, function (err, o) {
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
