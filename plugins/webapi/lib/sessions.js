var crypto = require("crypto");
var logger = require("winston");

module.exports = SessionManager;

function SessionManager(e, callback) {
    this.e = e;
    this.dbs = e.db.getDatabase("sessions");
    this.dbs.ensureIndex({
        fieldName: 'sid',
        unique: true
    });

    this.sessions = {};
    var self = this;
    this.dbs.find({}, function(err, docs) {
        if(err) {
            logger.error(err);

            throw err;
        }

        docs.forEach(function(val) {
            self.sessions[val.sid] = new Session(val, self);
            logger.debug("Loaded session " + JSON.stringify(self.sessions[val.sid].getValues()));
        });

        callback && callback();
    })
}

SessionManager.prototype._update = function (session) {
    if(typeof(session) == "string") {
        session = this.getSession(session);
    }

    this.sessions[session.sid] = session;


    var copy = session.getValues();

    logger.debug("Save session " + JSON.stringify(copy));

    this.dbs.update({
        sid: session.sid
    }, copy, {
        upsert: true
    }, function(err, numAffected, affectedDocuments, upsert) {
        if(err) {
            logger.error(err);
        }
    });
};

SessionManager.prototype.createSession = function () {
    var session = new Session({
        sid: this.randomKey(64),
        uid: null,
        key: this.randomKey(8)
    }, this);

    this.sessions[session.sid] = session;

    this._update(session);

    return session;
};

SessionManager.prototype.getSession = function (opt) {
    if(typeof(opt) == "string")  { // sid
        return this.sessions[opt];
    }

    if(opt.key) {
        for (var i in this.sessions) {
            if (this.sessions.hasOwnProperty(i) && this.sessions[i].key == opt.key) {
                return this.sessions[i];
            }
        }
    }

    return undefined;
};

SessionManager.prototype.randomKey = function (length) {
    var length = length || 64;
    var bytes = Math.ceil(length * 3 / 4);
    return crypto.randomBytes(bytes).toString('base64').substring(0, length).replace(/[^\w]/gi, 'X');
};


function Session(data, manager) {
    this.manager = manager;

    for(i in data) {
        this[i] = data[i];
    }
}

Session.prototype.save = function () {
    this.manager._update(this);
};

Session.prototype.getValues = function () {
    var copy = {};
    var list = ["sid", "uid", "key"];
    var self = this;

    list.forEach(function(v) {
        copy[v] = self[v];
    });

    return copy
};
