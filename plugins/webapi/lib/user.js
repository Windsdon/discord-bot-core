var logger = require("winston");

module.exports = User;

function User(uid, mod) {
    this.uid = uid;
    this.mod = mod;
    this.load();
}

User.prototype.load = function () {
    var obj = this.mod.e._disco.getUser(this.uid);
    logger.debug(JSON.stringify(obj));

    if(!obj) {
        this.uid = null;
        return;
    }

    this.user = obj;

    for (var o in obj.user) {
        if (obj.user.hasOwnProperty(o)) {
            this[o] = obj.user[o];
        }
    }
};
