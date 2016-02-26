var logger = require("winston");

module.exports = User;

function User(uid, mod) {
    this.uid = uid;
    this.mod = mod;
    this.load();
}

User.prototype.load = function () {
    var obj = this.mod.e._disco.getUser(this.uid);

    if(!obj) {
        this.uid = null;
        return;
    }

    obj.avatarURL = "https://cdn.discordapp.com/avatars/" + obj.id + "/" + obj.avatar + ".jpg";

    this.user = obj;

    for (var o in obj) {
        if (obj.hasOwnProperty(o)) {
            this[o] = obj[o];
        }
    }
};

User.prototype.getServers = function () {
    return this.mod.getUserServers(this.uid);
};
