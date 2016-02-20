var logger = require("winston");
var async = require("async");
var fs = require("fs");
var request = require("request");
var express = require('express');
var cookieParser = require('cookie-parser');
var path = require("path");
var User = require("./lib/user");
var SessionManager = require("./lib/sessions");

module.exports = {
    version: "0.1.0",
    name: "Web API",
    author: "Windsdon",
    init: WebMod
}

function WebMod(e, callback) {
    e.register.addCommand(["web", "login"], ["web.login"], [
        {
            id: "key",
            type: "string",
            required: true
        }
    ], clientAuth, "Login on the webclient", {
        enableAll: true
    });

    this.sessions = new SessionManager(e);
    this.endpoints = require("./lib/endpoints");

    this.e = e;

    logger.info("Starting web server");
    var app = express();
    this.app = app;

    app.use(cookieParser());

    // static files
    app.use(express.static(path.join(__dirname, "/static")));

    // setup initial request and load session
    app.use(this.getSession.bind(this));

    // auth page
    app.get('/auth', this.processAuth.bind(this));

    // api endpoint
    app.all('/api/:path*', this.processApi.bind(this));

    // main page
    app.get('/', this.processHome.bind(this));

    app.set('views', path.join(__dirname, "/views"));
    app.set('view engine', 'jade');

    // start the server
    app.listen(3000, function () {
        logger.info('Listening on port 3000!');
        callback();
    });

}

// Called by doing web login <key>
function clientAuth (e, args) {
    e.mod.clientAuth(e, args.key, function(err, response) {
        if(err) {
            e.mention().respond(err.message);
            return;
        }
        if(response) {
            e.mention().respond("You logged in successfully");
            return;
        }
    });
};

WebMod.prototype.clientAuth = function (e, key, callback) {
    var session = this.sessions.getSession({
        key: key
    });

    logger.debug(session.sid);

    if(!session || session.uid) {
        callback(new Error("That key is invalid"));
    } else {
        session.uid = e.userID;
        session.save();
        callback(null, true);
    }
};

var oneyear = 1000 * 60 * 60 * 24 * 365;

WebMod.prototype.createSession = function (res) {
    var session = this.sessions.createSession();
    logger.debug("Session ID: " + session.sid);
    res.cookie('sid', session.sid, {
        maxAge: oneyear
    });
};

WebMod.prototype.getSession = function (req, res, next) {
    req.mod = this;

    if(!req.cookies || !req.cookies.sid) {
        logger.debug("No session! Create a new one!");
        this.createSession(res);

        //redirect to login page
        res.redirect("/auth");
        next();
        return;
    }

    var session = this.sessions.getSession(req.cookies.sid);

    if(!session) {
        logger.debug("Invalid session! Create a new one!");
        this.createSession(res);

        //redirect to login page
        res.redirect("/auth");

        next();
        return;
    }

    if(!session.uid && req.path != "/auth" && req.path.indexOf("/api") != 0) {
        res.redirect("/auth");

        next();
        return;
    }

    req.session = session;
    next();
};


WebMod.prototype.processAuth = function (req, res) {
    if(!req.session) {
        return;
    }

    if(req.session.uid) {
        res.redirect("/");
    } else {
        res.render('auth', {
            command: this.e._disco.parsers["0"].activator + "web login " + req.session.key
        });
    }

};

WebMod.prototype.processApi = function (req, res, next) {
    logger.debug("Call to api: " + req.params.path);
    if(!req.session) {
        res.send(JSON.stringify({
            error: {
                message: "Invalid session"
            }
        }));
        return;
    }

    var name = req.params.path.replace(/\//gi, '.').replace(/\/$/, '')
    var endpoint = this.endpoints[name];

    if(!endpoint) {
        res.send(JSON.stringify({
            error: {
                message: "Invalid endpoint: " + name
            }
        }));
        return;
    }

    logger.debug("Calling endpoint: " + name);

    endpoint(req, res);
    res.end();
    next && next();
};

WebMod.prototype.processHome = function (req, res, next) {
    if(!req.session) {
        return;
    }

    res.render('index');

    next && next();
};

WebMod.prototype.getUser = function (uid) {
    if(!uid) {
        return null;
    } else {
        return new User(uid, this);
    }
};
