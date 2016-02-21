var logger = require("winston");

module.exports = {
    "logincheck": doLoginCheck,
    "servers": doServers
}

function doLoginCheck(req, res, callback) {
    if(req.session && req.session.uid) {
        logger.debug("OK");
        res.send(JSON.stringify({
            user: req.mod.getUser(req.session.uid).user
        }));
        callback();
    } else {
        res.send(JSON.stringify({}));
        callback();
    }
}

function doServers(req, res, callback) {

}
