var fs = require("fs");
var logger = require("winston");
var semver = require("semver");
/**
* @param db DatabaseManager
*/
function PluginManager(disco, db, register, callback) {
    this.disco = disco;
    this.db = db;
    this.pluginDir = "./plugins/";

    // contains current plugin information
    this.pluginDB = this.db.getDatabase("plugins", "core");

    this.register = register;

    this.plugins = {};
    this.loadPlugins(callback);
}

PluginManager.prototype.loadPlugins = function (callback) {
    var files = fs.readdirSync(this.pluginDir);
    var plugins = [];
    var self = this;
    files.forEach(function(f) {
        var stats = fs.statSync(self.pluginDir + f);
        if(stats.isDirectory()) {
            plugins.push(f);
        }
    });

    logger.info("Loading " + plugins.length + " plugins");

    var loader = new PluginLoader(this, plugins, callback);
    loader.loadNext();
};

PluginManager.prototype.loadPlugin = function (mod, callback) {
    logger.info("Loading plugin " + mod);
    try {
        var plugin = require("../" + this.pluginDir + mod + "/plugin.js");
    } catch(e) {
        logger.error("Exception while loading plugin " + mod);
        logger.error(e);
        return;
    }

    if(!plugin.mod) {
        plugin.mod = mod;
    } else {
        if(plugin.mod != mod) {
            plugin.mod = mod;
            logger.warn(`A plugin's name should match their folder name! Using ${mod}.`);
        }
    }

    var self = this;

    function abort() {
        logger.error(`Aborting loading of ${mod}:`);
        callback();
    }

    function load() {
        if(typeof(plugin.f) != "function") {
            logger.error(`Cannot find constructor ${mod}.f, check your exports!`);
            abort();
            return;
        }

        self.plugins[mod] = new plugin.f({
            _disco: self.disco,
            db: self.db.getAccess(mod),
            register: self.register.getFactory(mod)
        }, function() {
            callback();
        });
    }

    this.pluginDB.find({mod: mod}, function(err, data) {
        if(data.length == 0) {
            // run setup function
            if(typeof(plugin.setup) == "function") {
                plugin.setup({
                    _disco: self.disco,
                    db: self.db.getAccess(mod),
                    register: self.register.getFactory(mod)
                }, function(err) {
                    if(err) {
                        logger.error(`Error while setting up plugin ${mod}:`);
                        logger.error(err);
                        abort();
                    } else {
                        logger.info(`Completed setup for ${mod}`);
                        self.dbInsert(plugin, load);
                    }
                });
            } else {
                self.dbInsert(plugin, load);
            }
        } else {
            var pluginInfo = data[0];
            if(semver.gt(plugin['version'], pluginInfo['version'])) {
                // run upgrade function
                if(typeof(plugin.update) == "funcion") {
                    logger.info(`Upgrading ${mod} from version ${pluginInfo['version']} to ${plugin['version']}`);
                    plugin.update(pluginInfo, {
                        _disco: self.disco,
                        db: self.db.getAccess(mod),
                        register: self.register.getFactory(mod)
                    }, function(err) {
                        if(err) {
                            logger.error(`Error while upgrading plugin ${mod}:`);
                            logger.error(err);
                            abort();
                        } else {
                            logger.info(`Upgraded ${mod} to version ${pluginInfo['version']}`);
                            self.dbUpdate(plugin, load);
                        }
                    });
                } else {
                    logger.warn("Upgrading without upgrade function!");
                    self.dbUpdate(plugin, load);
                }
            } else if(semver.lt(plugin['version'], pluginInfo['version'])) {
                logger.warn(`Downgrading ${mod} to version ${plugin['version']} from ${pluginInfo['version']}`);
                self.dbUpdate(plugin, load);
            } else {
                self.dbUpdate(plugin, load);
            }
        }
    });
};

PluginManager.prototype.dbInsert = function (plugin, callback) {
    this.pluginDB.insert({
        mod: plugin.mod,
        version: plugin.version,
        extra: plugin.extra
    }, function(err) {
        if(err) {
            logger.error(err);
        }
        callback();
    });
};

PluginManager.prototype.dbUpdate = function (plugin, callback) {
    this.pluginDB.update({
        mod: plugin.mod
    }, {
        mod: plugin.mod,
        version: plugin.version,
        extra: plugin.extra
    }, {}, function(err) {
        if(err) {
            logger.error(err);
        }
        callback();
    });
};


function PluginLoader(manager, list, callback, context) {
    this.manager = manager;
    this.list = list;
    this.callback = callback;
    this.context = context || this;
    this.index = 0;
}

PluginLoader.prototype.loadNext = function () {
    var self = this;
    if(this.index >= this.list.length) {
        logger.info("Finished loading plugins");
        this.callback.apply(this.context);
        return;
    }

    self.manager.loadPlugin(this.list[this.index++], function(err) {
        if(err) {
            throw err;
        }
        self.loadNext();
    });
};

module.exports = PluginManager;
