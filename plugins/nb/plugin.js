var logger = require("winston");
var async = require("async");
var Thread = require("./lib/Thread.js");

module.exports = {
    version: "1.0.1",
    name: "NB Commands",
    author: "Windsdon",
    init: NB
}

function NB(e, callback) {
    this.poke = new (require("./lib/poke.js"))(e);

    //e._disco.addCommandHandler(async.apply(forumHandler, e), "start");

    e.register.addCommand(["nb", "thread"], ["nb.thread"], [
        {
            id: "url",
            type: "string",
            required: true
        }
    ], function(e, args) {
        var thread = new Thread(args.url);
        e.code(JSON.stringify(thread, null, 4)).respond;
        thread.linked().then(post => {
            e.code(JSON.stringify(post, null, 4)).respond();
        }).catch(err => {
            logger.error(err);
            e.code(err.message).respond();
        });
    }, "Debug: get thread");

    callback();
}

function forumHandler(e, o, callback) {
    try {
        var thread = new Thread(o.message);
        thread.linked().then(post => {
            e._disco.queueMessage(o.channelID,
                `Post linkado: **${post.title}**\npor **${post.user.name}** _${post.user.status}_ [Karma: ${post.user.karma}, Posts: ${post.user.posts}]\n\n${post.content}\n\n<${thread.permalink}>`
            );
        });
    } catch(err) {
    }

    callback();
}
