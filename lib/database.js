var Datastore = require('nedb');
var fs = require("fs");

function Database() {
    this.dbIndex = {};
    this.pathCache = [];
}

Database.prototype.getDatabase = function(name, mod, sid) {
    if(typeof(sid) == "undefined" || !sid || sid == "0") {
        sid = "_global";
    }

    if(typeof(mod) == "undefined") {
        mod = "_global";
    }

    if(typeof(name) == "undefined") {
        throw new Error("Called getDatabase with empty name");
    }

    var dbid = sid + ":" + mod + "/" + name;

    if(!this.dbIndex[dbid]) {
        this.dbIndex[dbid] = new Datastore({
            filename: 'db/'+ sid +'/'+ mod +'/'+ name +'.db',
            autoload: true
        });
    }

    return this.dbIndex[dbid];
}

Database.prototype.getAccess = function (mod) {
    return new DatabaseAccess(mod, this);
};

Database.prototype.getStoragePath = function (name, mod, sid) {
    if(typeof(sid) == "undefined" || !sid || sid == "0") {
        sid = "_global";
    }

    if(typeof(mod) == "undefined") {
        mod = "_global";
    }

    if(typeof(name) == "undefined") {
        throw new Error("Called getDatabase with empty name");
    }

    var path = "./db/_storage/" + sid + "/" + mod + "/" + name;
    if(this.pathCache.indexOf(path) != -1) {
        return path;
    }

    this.pathCache.push(path);

    // this is terrible
    try {
        fs.mkdirSync("./db");
    } catch(e) {};

    try {
        fs.mkdirSync("./db/_storage");
    } catch(e) {};

    try {
        fs.mkdirSync("./db/_storage/" + sid);
    } catch(e) {};

    try {
        fs.mkdirSync("./db/_storage/" + sid + "/" + mod);
    } catch(e) {};

    try {
        fs.mkdirSync("./db/_storage/" + sid + "/" + mod + "/" + name);
    } catch(e) {};

    return path;
};

/**
* Represents a plugin's access to the database
*/
function DatabaseAccess(mod, db) {
    this.mod = mod;
    this.db = db;
}

DatabaseAccess.prototype.getDatabase = function(name, sid) {
    return this.db.getDatabase(name, this.mod, sid);
}

DatabaseAccess.prototype.getStoragePath = function(name, sid) {
    return this.db.getStoragePath(name, this.mod, sid);
}

module.exports = Database;
