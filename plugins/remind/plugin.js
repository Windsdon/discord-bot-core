var logger = require("winston");
var chrono = require('chrono-node');
var async = require('async');
var crypto = require('crypto');

module.exports = {
    version: "9.1.0",
    name: "Remind",
    author: "Windsdon",
    init: Remind
}

var remind = null;

function Remind(e, callback) {
    e._disco.addCommandHandler(async.apply(remindHandler, e), "start");
    this.e = e;
    this.reminders = [];
    this.db = this.e.db.getDatabase("reminders");
    remind = this;

    this.loadAll(function(err, num) {
        logger.info("Loaded " + num + " reminders");
        callback();
    });
}

Remind.prototype.loadAll = function (callback) {
    var db = this.db;
    var self = this;
    db.find({}, function(err, data) {
        data.forEach(function(d) {
            self.reminders[d._id] = new Reminder(self.e._disco, db, d);
        });
        callback(undefined, data.length);
    });
};

Remind.prototype.create = function (opts) {
    var reminder = new Reminder(this.e._disco, this.db, opts);
    this.reminders[reminder._id] = reminder;
    return reminder;
};

function Reminder(disco, db, opts, triggerCB) {
    if(!opts.uid) {
        throw new Error("Invalid UID provided");
    }
    var self = this;
    this.paramList = ["uid", "creator", "message", "_id", "created", "channelID", "triggered", "deadline"];
    this.db = db;
    this._disco = disco;
    this.uid = opts.uid;
    this.creator = opts.creator;
    this.message = opts.message;
    this._id = opts._id || crypto.randomBytes(16).toString('hex');
    this.created = opts.created || (new Date()).getTime();
    this.channelID = opts.channelID || opts.uid;
    this.triggered = opts.triggered || false;
    this.deadline = opts.deadline || 0;
    triggerCB = triggerCB || () => {};
    if(!this.triggered) {
        this.timeoutID = setTimeout(function() {
            self.trigger();
            triggerCB();
        }, this.deadline - (new Date()).getTime());
    }

    this.save();
}

Reminder.prototype.save = function () {
    var o = {};
    for(var i in this) {
        if(this.paramList.indexOf(i) != -1) {
            o[i] = this[i];
        }
    }
    this.db.update({
        _id: this._id
    }, o, {
        upsert: true
    }, function(err, data) {
    });
};

Reminder.prototype.remove = function () {

};

Reminder.prototype.trigger = function () {
    this.triggered = true;
    this.save();
    this._disco.queueMessage(this.channelID, `<@${this.uid}> **REMINDER** \`${this._id}\`\n\`\`\`\n${this.message}\n\`\`\``);
};

function parseSimple(text) {
    var SECONDS = /(\d+) *(?:seconds|seconds|sec|s)/i;
    var MINUTES = /(\d+) *(?:minutes|minute|min|m)/i;
    var HOURS = /(\d+) *(?:hours|hour|h)/i;
    var DAYS = /(\d+) *(?:days|days|d)/i;

    var match = /(in)? *\d+/.exec(text);
    if(!match) {
        return false
    }

    var delta = 0;

    var s = SECONDS.exec(text);
    if(s && s[1]) {
        delta += s[1];
    }

    var s = MINUTES.exec(text);
    if(s && s[1]) {
        delta += s[1] * 60;
    }

    var s = HOURS.exec(text);
    if(s && s[1]) {
        delta += s[1] * 60 * 60;
    }

    var s = DAYS.exec(text);
    if(s && s[1]) {
        delta += s[1] * 60 * 60 * 24;
    }

    return [
        {
            index: match.index,
            start: {
                date: function() {
                    return new Date((new Date()).getTime() + delta * 1000);
                }
            }
        }
    ]
}

function createReminder(creatorUID, channelID, str, subjectUID) {
    var results = chrono.parse(str);

    subjectUID = subjectUID || creatorUID;

    if(!results || results.length == 0) {
        results = parseSimple(str);
    }

    if(!results || results.length == 0) {
        logger.debug("Invalid time");
        return false;
    }

    var r = results[results.length - 1];

    var text = str.substring(0, r.index);

    return remind.create({
        uid: subjectUID,
        creator: creatorUID,
        message: text,
        channelID: channelID,
        deadline: r.start.date().getTime()
    });
}


function remindHandler(e, o, callback) {
    var m = /(?:reminder|remind|remember) *(?:me|<@!?([0-9]+)>)? *(?:to|of|about)? *(.*)/i.exec(o.message);
    if(m) {
        var reminder = createReminder(o.userID, o.channelID, m[2], m[1] || o.userID);

        if(reminder) {
            o._disco.queueMessage(o.channelID, `I'll remind <@${reminder.uid}> of \`${reminder.message}\` on ${(new Date(reminder.deadline)).toString()} (\`${reminder._id}\`)`);
        }
    }

    callback();
}
