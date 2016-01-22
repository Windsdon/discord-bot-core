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
function PermissionManager(db, dbKeys, callback) {
    this.db = db;
    this.dbKeys = dbKeys;
    this.groupCache = {};
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
            if(typeof(callback) == "function") {
                callback(false);
            }
            logger.error(err);
            return;
        }

        self.groupCache = {};

        docs.forEach(function(e) {
            delete e["_id"];
            self.groupCache[e.sid + ":" + e.group] = e;
        })

        logger.info("Finished reloading permissions");

        if(typeof(callback) == "function") {
            callback(self);
        }
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
    groups.forEach(function(g){
        if(self.groupHasUser(g, uid)) {
            ugroups[g.sid + ":" + g.group] = g;
        }
    });

    return ugroups;
}

PermissionManager.prototype.groupHasUser = function(group, uid) {
    return group.users.indexOf(uid) != -1;
}

/**
* If no sid is provided, this group becomes global (sid = 0)
* @return object|false new group
*/
PermissionManager.prototype.createGroup = function(group, sid, callback) {
    if(!group) {
        logger.error("Tried to create group with no name");
        return false;
    }

    if(!/[a-z0-9]/.test(group)) {
        logger.error("Tried to create group with invalid name");
        return false;
    }

    if(typeof(sid) == "undefined") {
        sid = 0;
    }

    if(this.groupExists(group, sid)) {
        logger.warn("This group already exists");
        return false;
    }

    var g = {
        group: group,
        sid: sid,
        users: [],
        permissions: [],
        gid: sid + ":" + group
    };


    // make a local copy on the cache
    this.groupCache[sid + ":" + group] = g;

    this.db.insert([g], function (err, newDocs) {
        if(err) {
            logger.error("Error while saving group");
            throw err;
        }
        if(typeof(callback) == "function") {
            if(err) {
                callback(false);
            } else {
                callback(newDocs[0]);
            }
        }
    });
}

/**
* If no sid is provided, returns all groups
* always include global groups
*/
PermissionManager.prototype.getGroups = function(sid) {
    if(typeof(sid) == "undefined") {
        sid = 0;
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
    var gid = "";

    if(typeof(sid) == "undefined") {
        sid = 0;
    }

    if(group.indexOf(":") > 0) {
        gid = group;
    } else {
        gid = sid + ":" + group;
    }

    return !!this.groupCache[gid];
}

PermissionManager.prototype.groupGrant = function(permission, group, sid) {
    return this._groupAddPermissions([permission], this.getGID(group, sid));
}

PermissionManager.prototype.groupDeny = function(permission, group, sid) {
    return this._groupAddPermissions(["!" + permission], this.getGID(group, sid));
}

PermissionManager.prototype.getGID = function(group, sid) {
    var gid = "";

    if(typeof(sid) == "undefined") {
        sid = 0;
    }

    if(group.indexOf(":") > 0) {
        gid = group;
    } else {
        gid = sid + ":" + group;
    }

    return gid;
}

PermissionManager.prototype._groupAddPermissions = function(permissions, gid) {
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
        if(g.permissions.indexOf(perm) != -1) {
            return;
        }
        logger.info("Added permission " + perm + " to group " + gid);
        g.permissions.push(perm);
    });

    this._updateGroup(gid);

    return true;
}

PermissionManager.prototype.addUserToGroup = function(uid, group, sid) {
    if(!group || !uid) {
        logger.warn("addUserToGroup with empty parameters");
        return false;
    }

    var gid = "";

    if(typeof(sid) == "undefined") {
        sid = 0;
    }

    if(group.indexOf(":") > 0) {
        gid = group;
        var p = group.split(":");
        group = p[1];
        sid = p [0];
    } else {
        gid = sid + ":" + group;
    }

    if(!this.groupCache[gid]) {
        logger.warn("addUserToGroup Group doesn't exist: " + gid);
        return false;
    }

    if(this.groupCache[gid].users.indexOf(uid) != -1) {
        logger.debug("User " + uid + " already in group " + gid);
        return true;
    }

    this.groupCache[gid].users.push(uid);

    logger.info("Added " + uid + " to group " + gid);

    this._updateGroup(gid);

    return true;
}

PermissionManager.prototype._updateGroup = function(gid) {
    this.db.update({
        gid: gid
    }, this.groupCache[gid], {}, function(err) {
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
    this.dbKeys.find({
        key: key
    }, function(err, data) {
        if(data.length == 0) {
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

module.exports = {
    Permission: Permission,
    PermissionManager: PermissionManager
};
