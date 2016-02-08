var logger = require("winston");

function groupList(e, args) {
    var cache = e._disco.pm.groupCache;

    var str = "```\n";

    for (var group in cache) {
        if (cache.hasOwnProperty(group)) {
            if(cache[group].group == "guest") {
                // ignore guest groups
                continue;
            }
            str += `Group ${group}\n`;
            var list = [];
            var users = e._disco.pm.getUsersInGroup(group);
            if(cache[group].roles && cache[group].roles.length != 0) {
                str += `    Role links: `;
                var roles = [];
                cache[group].roles.forEach(function(v) {
                    roles.push(e.roleName(v, null));
                })
                str += roles.join(", ") + "\n";
            }
            // I may change back in the future
            if(cache[group].group == "guest") {
                str += `    Ignoring ${users.length} users in this guest group\n`;
                continue;
            }
            users.forEach(function(v) {
                list.push(e.getName(v));
            });
            str += "    ";
            str += list.join(", ") + "\n";
        }
    }

    str += "\n```";

    e.respond(str);
}

function groupView(e, args) {
    var group = e._disco.pm.getGroup(args.group, args.where == "here" ? e.serverID : undefined);

    if(group == false) {
        e.mention().respond("This group doesn't exist");
        return;
    }

    var str = "```\n";

    str += `Group ${group.gid}\n`;
    str += "    Members: \n";
    var list = [];
    var users = e._disco.pm.getUsersInGroup(group.gid);
    users.forEach(function(v) {
        list.push(e.getName(v));
    });

    str += "        " + list.join("\n        ") + "\n";

    str +="    Permissions:\n";
    str += "        " + group.permissions.join("\n        ") + "\n";

    str += "\n```";

    e.respond(str);
}

function groupJoin(e, args) {
    var uid = args.user ? args.user : e.userID;
    var sid = (args.where == "here" ? e.serverID : undefined);
    var result = e._disco.pm.addUserToGroup(uid, args.group, sid);
    if(result.success) {
        e.mention().respond(`Added ${e.getName(uid)} to \`${args.group}\``);
    }
}

function groupLeave(e, args) {
    var uid = args.user ? args.user : e.userID;
    var sid = (args.where == "here" ? e.serverID : undefined);
    var result = e._disco.pm.addUserToGroup(uid, args.group, sid);
    if(result.success) {
        e.mention().respond(`Removed ${e.getName(uid)} from \`${args.group}\``);
    }
}

function groupCreate(e, args) {
    if(e._disco.pm.createGroup(args.group, args.where == "here" ? e.serverID : undefined)) {
        e.mention().respond(`Created group \`${args.group}\``);
        groupView(e, args);
    } else {
        e.mention().respond(`Failed to create group \`${args.group}\``);
    }
}

function groupRemove(e, args) {
    if(e._disco.pm.removeGroup(args.group, args.where == "here" ? e.serverID : undefined)) {
        e.mention().respond(`Removed group \`${args.group}\``);
        groupView(e, args);
    } else {
        e.mention().respond(`Failed to remove group \`${args.group}\``);
    }
}

function groupGrant(e, args) {
    if(e._disco.pm.groupGrant(args.permission, args.group, args.where == "here" ? e.serverID : undefined)) {
        e.mention().respond(`Granted \`${args.permission}\` to \`${args.group}\``);
        groupView(e, args);
    } else {
        e.mention().respond(`Failed to do that!`);
    }
}

function groupUnGrant(e, args) {
    if(e._disco.pm.groupUnGrant(args.permission, args.group, args.where == "here" ? e.serverID : undefined)) {
        e.mention().respond(`Removed \`${args.permission}\` from \`${args.group}\``);
        groupView(e, args);
    } else {
        e.mention().respond(`Failed to do that!`);
    }
}

function groupDeny(e, args) {
    if(e._disco.pm.groupDeny(args.permission, args.group, args.where == "here" ? e.serverID : undefined)) {
        e.mention().respond(`Denied \`${args.permission}\` to \`${args.group}\``);
        groupView(e, args);
    } else {
        e.mention().respond(`Failed to do that!`);
    }
}

function groupUnDeny(e, args) {
    if(e._disco.pm.groupUnDeny(args.permission, args.group, args.where == "here" ? e.serverID : undefined)) {
        e.mention().respond(`Removed deny \`${args.permission}\` from \`${args.group}\``);
        groupView(e, args);
    } else {
        e.mention().respond(`Failed to do that!`);
    }
}

function rights(e, args) {
    var subject = args.user || e.userID;

    var str = "```\nYour permissions:\n";
    var groups = e._disco.pm.getUserGroups(subject, e.serverID);

    for (var gid in groups) {
        if (groups.hasOwnProperty(gid)) {
            str += "    Inherited form " + gid + "\n";
            str += "        " + groups[gid].permissions.join("\n        ") + "\n";
        }
    }

    str += "```";

    e.mention().respond(str);
}

function groupRights(e, args) {
    e.text(`[Viewing ${e.getName(args.user)}'s permissions'] `);
    rights(e, args);
}

function groupRoleList(e, args) {
    var roles = e.getRoles(null);

    var str = "";
    for (var rid in roles) {
        if (roles.hasOwnProperty(rid)) {
            str += `${rid} as ${roles[rid].name.replace("@", "[at]")}\n`
        }
    }

    e.mention().text("List of server roles:\n").code(str).respond();
}

function groupRoleAdd(e, args) {
    if(e._disco.pm.roleAdd(args.group, args.where == "here" ? e.serverID : undefined, args.role)) {
        e.mention().respond(`Linked \`${args.role}\` and \`${args.group}\``);
    } else {
        e.mention().respond("Failed to do that!");
    }
}

function groupRoleRemove(e, args) {
    if(e._disco.pm.roleAdd(args.group, args.where == "here" ? e.serverID : undefined, args.role)) {
        e.mention().respond(`Unlinked \`${args.role}\` and \`${args.group}\``);
    } else {
        e.mention().respond("Failed to do that!");
    }
}

function permissions(e, args) {
    if(args.command) {
        var id = args.command.replace(/ +/gi, ".");
        if(!e._disco.register.commands[id]) {
            e.mention().respond("That command doesn't exist!");
            return;
        }

        var str = "```Listing permissions for command: " + id + "\n ";

        var list = e._disco.register.commands[id].permissions.permissions;

        str += "    " + list.join("\n    ") + "";

        str += "```";
        e.respond(str);
    } else {
        var str = "```Listing permissions on each plugin\n\n";
        for (var mod in e._disco.plugins.plugins) {
            if (e._disco.plugins.plugins.hasOwnProperty(mod)) {
                str += `${mod}\n`
                var list = [];
                for (var cmd in e._disco.register.commands) {
                    if (e._disco.register.commands.hasOwnProperty(cmd)) {
                        var command = e._disco.register.commands[cmd];
                        if(command.mod == mod) {
                            command.permissions.permissions.forEach(function(v) {
                                if(list.indexOf(v) == -1) {
                                    list.push(v);
                                }
                            });
                        }
                    }
                }

                str += "    " + list.join("\n    ") + "\n\n";
            }
        }

        str += "```";
        e.respond(str);
    }
}

module.exports = function(e) {
    e.register.addCommand(["group", "view"], ["group.view"], [
        {
            id: "group",
            type: "string",
            required: true
        },
        {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupView, "List group members and permissions");

    e.register.addCommand(["rights"], ["group.rights"], [], rights, "See your permissions");
    e.register.addCommand(["group", "rights"], ["group.view"], [
        {
            id: "user",
            type: "mention",
            required: true
        }
    ], groupRights, "See other's permissions");

    e.register.addCommand(["group", "list"], ["group.view"], [], groupList, "List all groups on all servers")

    // if you can join a group, you can do anything else
    // so there is no point in doing several permissions
    e.register.addCommand(["group", "join"], ["group.manage"], [{
        id: "group",
        type: "string",
        required: true
    }, {
        id: "user",
        type: "mention",
        required: false
    }, {
        id: "where",
        type: "choice",
        options: {
            list: ["here"]
        },
        required: false
    }], groupJoin, "Add someone to a group");

    e.register.addCommand(["group", "leave"], ["group.manage"], [{
        id: "group",
        type: "string",
        required: true
    }, {
        id: "user",
        type: "mention",
        required: false
    }, {
        id: "where",
        type: "choice",
        options: {
            list: ["here"]
        },
        required: false
    }], groupLeave, "Remove someone from a group");

    e.register.addCommand(["group", "create"], ["group.manage"], [
        {
            id: "group",
            type: "string",
            required: true
        }, {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupCreate, "Create a group");

    e.register.addCommand(["group", "remove"], ["group.manage"], [
        {
            id: "group",
            type: "string",
            required: true
        }, {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupRemove, "Delete a group");

    e.register.addCommand(["group", "grant"], ["group.manage"], [
        {
            id: "group",
            type: "string",
            required: true
        }, {
            id: "permission",
            type: "string",
            required: true
        }, {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupGrant, "Give a group permissions");

    e.register.addCommand(["group", "ungrant"], ["group.manage"], [
        {
            id: "group",
            type: "string",
            required: true
        }, {
            id: "permission",
            type: "string",
            required: true
        }, {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupUnGrant, "Remove permissions from a group");

    e.register.addCommand(["group", "deny"], ["group.manage"], [
        {
            id: "group",
            type: "string",
            required: true
        }, {
            id: "permission",
            type: "string",
            required: true
        }, {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupDeny, "Deny something for a group");

    e.register.addCommand(["group", "undeny"], ["group.manage"], [
        {
            id: "group",
            type: "string",
            required: true
        }, {
            id: "permission",
            type: "string",
            required: true
        }, {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupUnDeny, "Remove denies from a group");

    e.register.addCommand(["group", "role", "list"], ["group.roles"], [], groupRoleList, "List server roles");

    e.register.addCommand(["group", "role", "add"], ["group.manage"], [
        {
            id: "group",
            type: "string",
            required: true
        }, {
            id: "role",
            type: "string",
            required: true
        }, {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupRoleAdd, "Link a role to a group");

    e.register.addCommand(["group", "role", "remove"], ["group.manage"], [
        {
            id: "group",
            type: "string",
            required: true
        }, {
            id: "role",
            type: "string",
            required: true
        }, {
            id: "where",
            type: "choice",
            options: {
                list: ["here"]
            },
            required: false
        }
    ], groupRoleRemove, "Unlink a group from a role");

    e.register.addCommand(["permissions"], ["permissions.view"], [
        {
            id: "command",
            type: "string",
            required: false
        }
    ], permissions, "List permissions required to run a command");

}
