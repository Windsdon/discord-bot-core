var logger = require("winston");
var async = require("async");

module.exports = {
    version: "1.0.0",
    name: "Dialog Generator",
    author: "Windsdon",
    init: DialogMod
}


function DialogMod(e, callback) {
    e._disco.addCommandHandler(async.apply(dialogHandler, e, this), "start");
    e.register.addCommand(["dialog", "enable"], ["dialog.config.enable"], [], dialogEnable, "Enable dialog parsing");
    e.register.addCommand(["dialog", "disable"], ["dialog.config.disable"], [], dialogDisable, "Disable dialog parsing");

    this.generators = {};
    this.characters = {};
    addGenerator("undertale", e, this);

    callback();
}

function dialogHandler(e, mod, o, callback) {
    var db = e.db.getDatabase("settings", o.serverID);

    // check if enabled
    db.find({
        config: "enable",
        value: true
    }, function(err, data) {
        if(err || !data || !data.length) {
            callback();
            return;
        }

        var search = /^(\w+)(?:\[([\w,]*)])?:(.*)/;

        var matched = o.message.match(search);

        if(!matched) {
            callback();
        } else {
            matched.shift();
            if(mod.characters[matched[0]]) {
                try {
                    mod.generators[mod.characters[matched[0]]].make(matched, function(err, file) {
                        if(err) {
                            if(err.message && !err.silent) {
                                e._disco.queueMessage(o.channelID, err.message);
                            }
                            return;
                        }
                        if(file) {
                            e._disco.queueFile(o.channelID, file);
                        }
                    });
                    callback(); // don't stop the rest of the processing!
                } catch (err) {
                    logger.error(err);
                    callback();
                    return;
                }
            }
        }
    })
}

function addGenerator(id, e, mod) {
    try {
        var gen = new (require("./generators/" + id + "/generator.js"))(e);
        mod.generators[id] = gen;

        if(!gen.exports) {
            return;
        }

        if(gen.exports.characters) {
            gen.exports.characters.forEach(function(i, v) {
                mod.characters[i] = id;
            });
        }
    } catch(err) {
        logger.error(err);
    }
}

function dialogEnable(e, args) {
    var db = e.db.getDatabase("settings", e.serverID);

    _dialogSetEnable(db, true, function (err, numReplaced, upsert) {
        if(err) {
            logger.error(err);
        } else {
            e.mention().respond("Enabled dialog parsing");
        }
    });
}

function dialogDisable(e, args) {
    var db = e.db.getDatabase("settings", e.serverID);

    _dialogSetEnable(db, false, function (err, numReplaced, upsert) {
        if(err) {
            logger.error(err);
        } else {
            e.mention().respond("Disabled dialog parsing");
        }
    });
}

function _dialogSetEnable(db, value, cb) {
    db.update({
        config: "enable"
    }, {
        $set: {
            value: value
        }
    }, { upsert: true }, cb);
}
