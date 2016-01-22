function groupList(e, args) {
    var cache = e._disco.pm.groupCache;

    var str = "```\n";

    for (var group in cache) {
        if (cache.hasOwnProperty(group)) {
            str += `Group ${group}\n`;
            str += "    ";
            var list = [];
            cache[group].users.forEach(function(v) {
                list.push(e.getName(v));
            });
            str += list.join(", ") + "\n";
        }
    }

    str += "\n```";

    e.respond(str);
}

function groupJoin(e, args) {
    
}

module.exports = function(e) {
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
    }], groupJoin, "Add someone to a group");
    e.register.addCommand(["group", "leave"], ["group.manage"]);
    e.register.addCommand(["group", "add"], ["group.manage"]);
    e.register.addCommand(["group", "remove"], ["group.manage"]);
    e.register.addCommand(["group", "grant"], ["group.manage"]);
    e.register.addCommand(["group", "deny"], ["group.manage"]);
}
