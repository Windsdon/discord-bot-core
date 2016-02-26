var logger = require("winston");
var jade = require("jade");

module.exports = {
    "logincheck": doLoginCheck,
    "servers": doServers,
    "server": doServer,
    "dashboard": doDashboard
}

function doLoginCheck(req, res, callback) {
    if(req.session && req.session.uid) {
        logger.debug("OK", "WEB_API");
        res.json({
            response:{
                user: req.mod.getUser(req.session.uid).user
            }
        });
        callback();
    } else {
        res.send(JSON.stringify({}));
        callback();
    }
}

function doServers(req, res, callback) {
    logger.debug("Received doServers");
    var widgets = req.mod.getWidgets("servers");
    setTimeout(callback, 2000);
}

function doServer(req, res, callback) {
    logger.debug("Received doServer");
    var matches = req.params.path.match(/server(?:.|\/)([0-9]+)/);
    logger.debug(JSON.stringify({
        path: req.params.path,
        matches: matches
    }));
    if(!matches) {
        res.error("Invalid request");
        callback();
        return;
    }
    var sid = matches[1];
    var server = req.mod.e._disco.bot.servers[sid];
    if(!server) {
        res.error("Invalid server");
        callback();
        return;
    }

    if(Object.keys(req.user.getServers()).indexOf(sid) == -1) {
        res.error("You can't see this server");
        callback();
        return;
    }

    if(req.query.type == "render") {
        res.json({
            render: {
                title: server.name,
                content: ""
            }
        })
    } else {
        res.json({
            response: {
                server: server
            }
        })
    }

}

function doDashboard(req, res, callback) {
    res.json({
        render: {
            title: "Dashboard",
            content: "<h3>Testing</h3>"
        }
    })
}
