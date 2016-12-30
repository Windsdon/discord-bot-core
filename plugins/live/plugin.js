var logger = require("winston");
var async = require("async");
var util = require('util');

module.exports = {
	version: "0.1.0",
	name: "Live Interface",
	author: "Windsdon",
	init: LiveMod
}

function LiveMod(e, callback) {
	e.register.addCommand(["live", "countdown"], ["live.countdown"], [
		{
			id: "time",
			type: "number",
			required: true
		},
		{
			id: "action",
			type: "string",
			required: false
		}
	], countdown, "Creates a countdown");

	e.register.addCommand(["live", "command"], ["live.command"], [
		{
			id: "action",
			type: "string",
			required: true
		},
		{
			id: "interval",
			type: "number",
			required: true
		}
	], liveCommand, "Creates a countdown");

	e.register.addCommand(["live", "stop"], ["live.stop"], [], liveStop, "Stop all live messages (created with 'live command')");

	this.lives = [];

	callback();
}

function extend(origin, add) {
	// Don't do anything if add isn't an object
	if (!add || typeof add !== 'object') return origin;

	for (i in add) {
		origin[i] = add[i];
	}
	return origin;
}

/**
* Creates a live message, which is generated and updated by calling fn.
* e is MODIFIED!
* fn's prototype is fn(e, args, callback)
* callback(err) should be called when the message is to be updated
* if an error is given, stops updating and calls callback(err)
*/
LiveMod.prototype.LiveMessage = function (e, args, fn, callback) {
	e._respond = e.respond;
	e._liveid = null;
	callback = callback || function () { };
	// modify the response to edit instead
	e.respond = function (message, callback) {
		callback = callback || function () { };
		var self = this;
		if (!self._liveid) {
			self._respond(message, function (err, response) {
				if (!response || !response.id) {
					logger.error(err);
					callback(response);
					return;
				}
				self._liveid = response.id;
				logger.debug("Started live message with id: " + self._liveid);
				callback(response);
			});
		} else {
			if (typeof (message) == "undefined") {
				message = "";
			}
			if (typeof (message) == "string") {
				message = self._prepend + message;
			}
			self._disco.editMessage(self._liveid, self.channelID, message, function (response) {
				callback(response);
			});
			self._prepend = "";
			return this;
		}
	}

	var stopRequested = false;

	this.stop = function () {
		stopRequested = true;
	}

	if (typeof (fn) != "function") {
		throw new Error("fn is not a function");
	}

	function call() {
		if (stopRequested) {
			return;
		}
		fn(e, args, function (err) {
			if (err) {
				callback(err);
				return;
			}
			call();
		});
	}

	call();
};

function countdown(e, args) {
	var endTime = (new Date()).getTime() + args.time * 1000;
	var live = new (e.getMod("live").LiveMessage)(e, args, function (e, args, callback) {
		timeLeft = endTime - (new Date()).getTime();
		if (timeLeft <= 0) {
			e.respond(`Time's up!`);
			callback(true);
			return;
		}
		e.respond(`Time left: ${formatTime(timeLeft)}`);
		setTimeout(callback, 1000);
	}, function () {
		if (args.action) {
			e.command(args.action);
		}
	});
}

function liveCommand(e, args) {
	if (args.interval < 1) {
		e.mention().respond("The minimal interval is 1 second!");
		return;
	}

	e.mod.lives.push(new (e.mod.LiveMessage)(e, args, function (e, args, callback) {
		try {
			// create the message
			if (e._liveid == null) {
				e.respond("*Initializing live message...*", function () {
					callback();
				});
				return;
			}
			var copy = ["_respond", "respond", "_liveid"];
			var replace = {};

			for (i in e) {
				if (copy.indexOf(i) != -1) {
					replace[i] = e[i];
				}
			}

			e.command(args.action, {
				_extend: replace
			});
			setTimeout(callback, args.interval * 1000);
		} catch (err) {
			logger.error(err);
			callback(err);
		}
	}));
}

function liveStop(e, args) {
	e.mod.lives.forEach((v) => {
		v.stop();
	});

	e.mod.lives = [];
}

function formatTime(millis) {
	var sec_num = Math.floor(millis / 1000);
	var hours = Math.floor(sec_num / 3600);
	var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
	var seconds = sec_num - (hours * 3600) - (minutes * 60);

	if (hours < 10) { hours = "0" + hours; }
	if (minutes < 10) { minutes = "0" + minutes; }
	if (seconds < 10) { seconds = "0" + seconds; }
	var time = `${hours}:${minutes}:${seconds}`;
	return time;
}
