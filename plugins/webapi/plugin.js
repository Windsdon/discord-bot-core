var logger = require("winston");
var async = require("async");
var fs = require("fs");
var request = require("request");
var express = require('express');
var cookieParser = require('cookie-parser');
var path = require("path");
var User = require("./lib/user");
var SessionManager = require("./lib/sessions");
var jade = require("jade");

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
    this.pages = [];

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

    // logout page
    app.get('/logout', this.processLogout.bind(this));

    app.set('views', path.join(__dirname, "/views"));
    app.set('view engine', 'jade');

    app.use(function(err, req, res, next) {
        logger.error(err);
        next(err);
    });

    // start the server
    app.listen(8877, function () {
        logger.info('Listening on port 8877!');
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
    res.cookie('sid', session.sid, {
        maxAge: oneyear
    });
};

WebMod.prototype.getSession = function (req, res, next) {
    req.mod = this;

    if(!req.cookies || !req.cookies.sid) {
        this.createSession(res);

        //redirect to login page
        res.redirect("/auth");
        res.end();
        return;
    }

    var session = this.sessions.getSession(req.cookies.sid);

    if(!session) {
        this.createSession(res);

        //redirect to login page
        res.redirect("/auth");

        res.end();
        return;
    }

    if(!session.uid && req.path != "/auth" && req.path != "/logout" && req.path.indexOf("/api") != 0) {
        res.redirect("/auth");

        res.end();
        return;
    }

    req.session = session;
    req.user = this.getUser(req.session.uid);

    res.error = function(message) {
        this.json({
            error: {
                message: message
            }
        });
    }

    next();
};


WebMod.prototype.processAuth = function (req, res) {
    if(!req.session) {
        return;
    }

    if(req.session.uid) {
        res.redirect("/");
    } else {
        res.status(200);
        res.render('auth', {
            command: this.e._disco.parsers["0"].activator + "web login " + req.session.key
        });
    }

};

WebMod.prototype.processApi = function (req, res, callback) {
    if(!req.session) {
        res.json({
            error: {
                message: "Invalid session"
            }
        });
        res.end();
        callback();
        return;
    }

    logger.debug(JSON.stringify(req.params));
    req.params.path += req.params[0];

    var name = req.params.path.replace(/\//gi, '.').replace(/\/$/, '');
    var parts = name.split(".");

    var endpoint = null;
    var id = "";
    for(var i = 0; i < parts.length; i++) {
        var newID = parts.slice(0, i + 1).join(".");
        if(this.endpoints[newID]) {
            id = newID;
            endpoint = this.endpoints[newID];
        }
    }

    if(!endpoint) {
        res.json({
            error: {
                message: "Invalid endpoint: " + name
            }
        });
        res.end();
        callback();
        return;
    }

    logger.debug("Calling endpoint: " + id, "WEB_API");

    endpoint(req, res, function() {
        res.end();
        callback();
    });
};

WebMod.prototype.processHome = function (req, res) {
    if(!req.session) {
        return;
    }

    res.status(200);

    var sidebar = [
        {
            icon: "dashboard",
            label: "Dashboard",
            url: "#dashboard"
        }, {
            icon: "server",
            label: "Servers",
            url: "#servers",
            list: this.getServerNav(req.session)
        }
    ];

    this.pages.forEach(function(v) {
        if(v.enable && v.enable.sidebar && (!v.permissions || this._disco.pm.canUser(v.permissions))) {
            sidebar.push({
                icon: v.icon,
                label: v.label,
                url: "#page/" + v.id
            });
        }
    });

    res.render('index', {
        user: req.user,
        page: {
            title: "",
            content: ""
        },
        sidebar: sidebar
    });
};

WebMod.prototype.getUser = function (uid) {
    if(!uid) {
        return null;
    } else {
        return new User(uid, this);
    }
};

WebMod.prototype.processLogout = function (req, res) {
    res.clearCookie('sid');
    res.redirect('/auth');
    res.end();
};

WebMod.prototype.getUserServers = function (uid) {
    var self = this;
    var list = {};

    for (var sid in this.e._disco.bot.servers) {
        if (this.e._disco.bot.servers.hasOwnProperty(sid)) {
            var server = this.e._disco.bot.servers[sid];
            if(Object.keys(server.members).indexOf(uid) != -1) {
                list[server.id] = server;
            }
        }
    }

    return list;
};

WebMod.prototype.getServerNav = function (session) {
    var servers = this.getUserServers(session.uid);

    var nav = [
        // {
        //     label: "All Servers",
        //     url: "#servers"
        // }
    ];

    for (var sid in servers) {
        if (servers.hasOwnProperty(sid)) {
            nav.push({
                label: servers[sid].name,
                url: "#server/" + sid
            });
        }
    }

    return nav;
};

WebMod.prototype.registerWidget = function (widget, target) {

};

WebMod.prototype.getWidgets = function (target) {

};

WebMod.prototype.registerPage = function (page) {

};
