var logger = require("winston");

function Permission(permissions) {
    if(typeof(permissions) == "string") {
        permissions = [permissions];
    } else if(typeof(permissions) == "undefined") {
        permissions = [];
    }
    this.permissions = [];
    var self = this;
    permissions.forEach(function(p) {
        if(/!?[a-z.*]+/.test(p)) {
            self.permissions.push(p);
        }
    })
}

/**
* @param Datastore db The database
*/
function PermissionManager(dba, disco, callback) {
    this.dba = dba;
    this.db = dba.getDatabase("permissions");
    this.db.ensureIndex({
        fieldName: "gid",
        unique: true
    });
    this.dbKeys = dba.getDatabase("authkeys");
    this.dbKeys.ensureIndex({
        fieldName: "key",
        unique: true
    });
    this.dbUsers = dba.getDatabase("users");
    this.dbUsers.ensureIndex({
        fieldName: "uid",
        unique: true
    });
    this.groupCache = {};
    this.userCache = {};
    this.disco = disco;
    this.load(callback);
}

/**
* Caches all groups to avoid a callback hell when getting user permissions
*/
PermissionManager.prototype.load = function(callback) {
    logger.info("Reloading permissions");
    var self = this;
    this.db.find({}, function (err, docs) {
        if(err) {
            logger.error(err);
            if(typeof(callback) == "function") {
                callback(false);
            }
            return;
        }

        self.groupCache = {};

        docs.forEach(function(e) {
            delete e["_id"];
            self.groupCache[e.sid + ":" + e.group] = e;
        });

        // cache users
        self.dbUsers.find({}, function (err, docs) {
            if(err) {
                logger.error(err);
                if(typeof(callback) == "function") {
                    callback(false);
                }
                return;
            }

            self.userCache = {};

            docs.forEach(function(e) {
                delete e["_id"];
                self.userCache[e.uid] = e;
            });

            // create global guest
            if(!self.groupCache[`0:guest`]) {
                self.createGroup("guest", "0");
            }

            logger.info("Finished reloading permissions");

            if(typeof(callback) == "function") {
                callback(self);
            }
        });
    });
}

/**
* Tests if a user has a certain permission
* @param string uid user ID
* @param Permission permissions
* @param string sid server ID
* @return true|false
*/
PermissionManager.prototype.canUser = function(uid, permissions, sid) {
    if(!permissions) {
        return true;
    }

    if(permissions.constructor == Permission) {
        permissions = permissions.permissions;
    }

    if(permissions.constructor != Array) {
        permissions = [permissions];
    }

    if(permissions.length == 0) {
        return true;
    }

    var groups = this.getUserGroups(uid, sid);
    var can = false;
    for (var i in groups) {
        if (groups.hasOwnProperty(i)) {
            if(this._canGroup(groups[i], permissions)) {
                can = true;
                break;
            }
        }
    }

    return can;
}

/**
* Tests if a group has a certain permission
* Internal method
* @param string|object group full group id (sid:gid) or group object
* @param array permissions permission list
* @return true|false
*/
PermissionManager.prototype._canGroup = function(group, permissions) {
    if(typeof(group) == "string") {
        if(!this.groupExists(group)) {
            logger.debug("Looking for invalid group: " + group);
            return false;
        }

        group = this.groupCache[group];
    }

    if(typeof(permissions) == "string") {
        permissions = [permissions];
    }

    var hasPerm = true;

    permissions.forEach(function(perm) {
        if(!hasPerm) {
            return;
        }
        if(typeof(perm) != "string") {
            return;
        }
        var pp = perm.split(".");
        var result = false;
        var depth = 0;
        for(i in group.permissions) {
            var gp = group.permissions[i];
            var deny = false;

            if(gp[0] == "!") {
                deny = true;
                gp = gp.substring(1);
            }

            gp = gp.split(".");

            if(gp.length < depth) {
                continue;
            }

            var related = true;
            if(gp.length > pp.length || (gp.length != pp.length && gp[gp.length - 1] != "*")) {
                related = false;
            } else {
                for(j in gp) {
                    if(pp[j] != gp[j] && gp[j] != "*") {
                        related = false;
                        break;
                    }
                }
            }

            if(!related) {
                continue;
            }

            result = !deny;
            depth = gp.length;
        }

        hasPerm = (hasPerm && result);
    });

    return hasPerm;
}

PermissionManager.prototype.getUserGroups = function(uid, sid) {
    var groups = this.getGroups(sid);

    var ugroups = {};
    var self = this;
    var uroles = this.disco.getRoles(uid) || {};
    groups.forEach(function(g){
        if(self.userHasGroup(g, uid, uroles)) {
            ugroups[g.sid + ":" + g.group] = g;
        }
    });

    return ugroups;
}

PermissionManager.prototype.groupHasUser = function(group, uid, uroles) {
    return this.userHasGroup(group, uid, uroles);
}

PermissionManager.prototype.userHasGroup = function (group, uid, uroles) {
    if(typeof(group) == "string") {
        group = this.getGroup(group);
    }

    if(!group) {
        return false;
    }

    if(group.group == "guest" || (this.userCache[uid] && this.userCache[uid].groups.indexOf(group.gid) != -1)) {
        return true;
    }

    if(!group.roles || group.roles.length == 0) {
        return false;
    }

    uroles = uroles || this.disco.getRoles(uid) || {};

    var fromRole = false;
    Object.keys(uroles).forEach(function(v) {
        if(!group.roles) {
            return;
        }

        if(group.roles.indexOf(v) != -1) {
            fromRole = true;
        }
    });

    if(fromRole) {
        return true;
    }

    return false;
};

PermissionManager.prototype.getGroup = function (group, sid) {
    var gid = this.getGID(group, sid);

    if(this.groupCache[gid]) {
        return this.groupCache[gid];
    }

    return false;
};

/**
* If no sid is provided, this group becomes global (sid = 0)
* Group can be sid:name as well
* @return object|null new group
*/
PermissionManager.prototype.createGroup = function(group, sid, callback) {
    callback = callback || () => {};

    try {
        var gid = this.getGID(group, sid);
    } catch(e) {
        callback(e);
        return null;
    }

    if(this.groupExists(group, sid)) {
        logger.warn("This group already exists");
        callback(new Error("This group already exists"));
        return null;
    }

    var group = gid.split(":")[1];
    var sid = gid.split(":")[0];

    var g = {
        group: group,
        sid: sid,
        permissions: [],
        gid: gid
    };


    // make a local copy on the cache
    this.groupCache[gid] = g;

    this.db.insert([g], function (err, newDocs) {
        if(err) {
            logger.error("Error while saving group");
            logger.error(err);
        }
        callback(err, newDocs);
    });

    return g;
}

/**
* Removes a group
* callback(err)
* @return bool success
*/
PermissionManager.prototype.removeGroup = function (group, sid, callback) {
    callback = callback || () => {};
    try {
        var gid = this.getGID(group, sid);
    } catch(e) {
        callback(e);
        return false;
    }

    if(!this.groupExists(group, sid)) {
        var msg = `This group doesn't exist: group = ${group}, sid = ${sid}`;
        logger.warn(msg);
        callback(new Error(msg))
        return false;
    }

    // delete the cached version
    delete this.groupCache[sid + ":" + group];

    this.db.remove({
        gid: gid
    }, function (err, newDocs) {
        if(err) {
            logger.error("Error while removing group");
            logger.error(err);
            callback(err);
        }

    });

    return true;
};

PermissionManager.prototype.getAllUsers = function () {
    var users = [];
    for (var sid in this.disco.bot.servers) {
        if (this.disco.bot.servers.hasOwnProperty(sid)) {
            for (var uid in this.disco.bot.servers[sid].members) {
                if (this.disco.bot.servers[sid].members.hasOwnProperty(uid)) {
                    if(users.indexOf(uid) == -1) {
                        users.push(uid);
                    }
                }
            }
        }
    }

    return users;
};

PermissionManager.prototype.getUsersInGroup = function (group, sid) {
    var gid = this.getGID(group, sid);

    var users = [];
    var self = this;

    this.getAllUsers().forEach(function(v) {
        if(self.groupHasUser(gid, v)) {
            users.push(v);
        }
    });

    return users;
};

/**
* If no sid is provided, returns all groups
* always includes global groups
*/
PermissionManager.prototype.getGroups = function(sid) {
    if(typeof(sid) == "undefined") {
        sid = 0;
    }

    // make guest group
    if(!this.groupCache[`${sid}:guest`]) {
        this.createGroup("guest", sid);
    }

    var groups = [];

    for (var i in this.groupCache) {
        if (this.groupCache.hasOwnProperty(i)) {
            var g = this.groupCache[i];
            if(g.sid == sid || g.sid == 0) {
                groups.push(g);
            }
        }
    }

    return groups;
}

PermissionManager.prototype.groupExists = function(group, sid) {
    var gid = this.getGID(group, sid);

    return !!this.groupCache[gid];
}

PermissionManager.prototype.groupGrant = function(permissions, group, sid) {
    return this._groupAddPermissions(permissions, this.getGID(group, sid));
}

PermissionManager.prototype.groupUnGrant = function(permissions, group, sid) {
    return this._groupRemovePermissions(permissions, this.getGID(group, sid));
}

PermissionManager.prototype.groupDeny = function(permissions, group, sid) {
    if(typeof(permissions) == "string") {
        permissions = [permissions];
    }
    permissions.forEach(function(v, i) {
        permissions[i] = "!" + v;
    });
    return this._groupAddPermissions(permissions, this.getGID(group, sid));
}

PermissionManager.prototype.groupUnDeny = function(permissions, group, sid) {
    if(typeof(permissions) == "string") {
        permissions = [permissions];
    }
    permissions.forEach(function(v, i) {
        permissions[i] = "!" + v;
    });
    return this._groupRemovePermissions(permissions, this.getGID(group, sid));
}

PermissionManager.prototype.getGID = function(group, sid) {
    var gid = "";

    if(typeof(sid) == "undefined") {
        sid = "0";
    }

    if(/^[0-9]+:[a-zA-Z]+$/.test(group)) {
        gid = group;
    } else if(/^[0-9]+$/.test(sid) && /^[a-zA-Z0-9]+$/.test(group)) {
        gid = sid + ":" + group;
    } else {
        throw new Error("Invalid group name: group = " + group + ", sid = " + sid);
    }

    return gid;
}

PermissionManager.prototype._groupAddPermissions = function(permissions, gid) {
    if(!this.groupCache[gid]) {
        logger.warn("No group " + gid);
        return false;
    }

    if(typeof(permissions) == "undefined") {
        logger.warn("permissions is a required argument");
        return false;
    }

    if(typeof(permissions) == "string") {
        permissions = [permissions];
    }

    if(permissions.constructor == Array) {
        permissions = new Permission(permissions);
    }

    if(permissions.constructor != Permission) {
        logger.warn("Invalid permission object");
        return false;
    }

    var g = this.groupCache[gid];

    permissions.permissions.forEach(function(perm) {
        if(g.permissions.indexOf(perm) != -1) {
            return;
        }
        logger.info("Added permission " + perm + " to group " + gid);
        g.permissions.push(perm);
    });

    this._updateGroup(gid);

    return true;
}

PermissionManager.prototype._groupRemovePermissions = function(permissions, gid) {
    if(!this.groupCache[gid]) {
        logger.warn("No group " + gid);
        return false;
    }

    if(typeof(permissions) == "string") {
        permissions = [permissions];
    }

    if(permissions.constructor == Array) {
        permissions = new Permission(permissions);
    }

    if(permissions.constructor != Permission) {
        logger.warn("Invalid permission object");
        return false;
    }

    var g = this.groupCache[gid];

    permissions.permissions.forEach(function(perm) {
        if(g.permissions.indexOf(perm) == -1) {
            return;
        }
        logger.info("Removed permission " + perm + " from group " + gid);
        g.permissions.splice(g.permissions.indexOf(perm), 1);
    });

    this._updateGroup(gid);

    return true;
}

PermissionManager.prototype.addUserToGroup = function(uid, group, sid) {
    if(!group || !uid) {
        logger.warn("addUserToGroup with empty parameters");
        return {
            success: false
        };
    }

    var gid = this.getGID(group, sid);

    if(!this.groupCache[gid]) {
        logger.warn("addUserToGroup Group doesn't exist: " + gid);
        return {
            success: false
        };
    }

    if(!this.userCache[uid]) {
        this.createUser(uid);
    }

    if(this.userCache[uid].groups.indexOf(gid) != -1) {
        logger.debug("User " + uid + " already in group " + gid);
        return {
            success: true
        };
    }

    this.userCache[uid].groups.push(gid);

    logger.info("Added " + uid + " to group " + gid);

    this._updateUser(uid);

    return {
        success: true
    };
}

PermissionManager.prototype.removeUserFromGroup = function(uid, group, sid) {
    if(!group || !uid) {
        logger.warn("removeUserFromGroup with empty parameters");
        return {
            success: false
        };
    }

    var gid = this.getGID(group, sid);

    if(!this.groupCache[gid]) {
        logger.warn("removeUserFromGroup Group doesn't exist: " + gid);
        return {
            success: false
        };
    }

    if(!this.userCache[uid]) {
        return {
            success: true
        };
    }

    if(this.userCache[uid].groups.indexOf(gid) == -1) {
        logger.debug("User " + uid + " not in group " + gid);
        return {
            success: true
        };
    }

    this.userCache[uid].groups.splice(this.userCache[uid].groups.indexOf(gid), 1);

    logger.info("Removed " + uid + " from group " + gid);

    this._updateUser(uid);

    return {
        success: true
    };
}


PermissionManager.prototype.createUser = function (uid) {
    var u = {
        uid: uid,
        groups: []
    };

    this.userCache[uid] = u;

    this.dbUsers.insert([u], function(err) {
        if(err) {
            logger.error(err);
        }
    });
};

PermissionManager.prototype._updateGroup = function(gid) {
    this.db.update({
        gid: gid
    }, this.groupCache[gid], {}, function(err) {
        if(err) {
            logger.error(err);
        }
    })
}

PermissionManager.prototype._updateUser = function(uid) {
    this.dbUsers.update({
        uid: uid
    }, this.userCache[uid], {}, function(err) {
        if(err) {
            logger.error(err);
        }
    })
}

PermissionManager.prototype.createPrivilegeKey = function (gid, callback) {
    var key = require("crypto").randomBytes(32).toString('hex');

    this.dbKeys.insert({
        key: key,
        gid: gid
    }, callback);

    return key;
};

PermissionManager.prototype.applyPrivilegeKey = function (uid, key, callback) {
    var self = this;
    logger.info(`Attempting to apply key ${key} to ${uid}`);
    this.dbKeys.find({
        key: key
    }, function(err, data) {
        logger.info(data);
        if(err || data.length == 0) {
            if(typeof(callback) == "function") {
                callback(false);
            }
            return;
        } else {
            self.addUserToGroup(uid, data[0].gid);
            self.dbKeys.remove({
                _id: data[0]._id
            }, {}, function() {
                if(typeof(callback) == "function") {
                    callback(data[0].gid);
                }
            });
            return;
        }
    })
};

PermissionManager.prototype.roleAdd = function (group, sid, role) {
    var g = this.getGroup(group, sid);

    if(!g) {
        logger.error("No group with id " + group + " on server " + sid)
        return false;
    }

    if(!/^[0-9]+$/.test(role)) {
        logger.error("Not a valid role: " + role)
        return false;
    }

    if(!g.roles) {
        g.roles = [];
    }

    if(g.roles.indexOf(role) != -1) {
        return true;
    }

    g.roles.push(role);

    this._updateGroup(g.gid);

    return true;
};

PermissionManager.prototype.roleRemove = function (group, sid, role) {
    var g = this.getGroup(group, sid);

    if(!g) {
        logger.error("No group with id " + group + " on server " + sid)
        return false;
    }

    if(!g.roles) {
        g.roles = [];
    }

    if(g.roles.indexOf(role) == -1) {
        return true;
    }

    g.roles.splice(g.roles.indexOf(role), 1);

    this._updateGroup(g.gid);

    return true;
};

module.exports = {
    Permission: Permission,
    PermissionManager: PermissionManager
};
