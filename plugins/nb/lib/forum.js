"use strict";

var cheerio = require('cheerio');
var request = require("request");
var logger = require('winston');
var EventEmitter = require('events');

var base = "http://forum.nintendoblast.com.br/";

class Forum extends EventEmitter {
	constructor(user, pass, callback) {
		super();
		callback = callback || function () { };
		var self = this;
		this.ready = false;
		this.jar = request.jar();
		this.request = request.defaults({ jar: this.jar })
		this.request({
			url: "http://forum.nintendoblast.com.br/login",
			method: "POST",
			form: {
				username: user,
				password: pass,
				autologin: "on",
				redirect: "",
				query: "",
				login: "Login"
			},
			followRedirect: false
		}, function (err, res, body) {
			if (res.statusCode == 200) {
				self.emit("failed", res);
				logger.debug("Failed to log-in");
				callback(new Error("Failed to log-in"), self);
			} else {
				self.emit("login");
				self.ready = true;
				logger.debug("Logged-in");
				callback(null, self);
			}
		});
	}
}

module.exports = Forum;
