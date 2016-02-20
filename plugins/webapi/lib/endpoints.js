var logger = require("winston");

module.exports = {
    "logincheck": doLoginCheck
}

function doLoginCheck(req, res) {
    if(req.session && req.session.uid) {
        logger.debug("OK");
        res.send(JSON.stringify({
            user: req.mod.getUser(req.session.uid).user
        }));
    } else {
        res.send(JSON.stringify({}));
    }
}
