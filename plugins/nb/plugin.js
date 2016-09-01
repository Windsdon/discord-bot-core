var logger = require("winston");
var async = require("async");
var Thread = require("./lib/thread.js");
var Forum = require("./lib/forum.js");
var PrivateMessage = require("./lib/pm.js");
var fs = require("fs");

module.exports = {
    version: "1.0.1",
    name: "NB Commands",
    author: "Windsdon",
    init: NB
}

var forum = null;
var pm = null;

function NB(e, callback) {
    this.poke = new (require("./lib/poke.js"))(e);

    //e._disco.addCommandHandler(async.apply(forumHandler, e), "start");
    e._disco.addCommandHandler(function(o, cb) {
        var mornings = [
            "Bom dia",
            "BAN dia",
            "Bundinha",
            "guter Tag",
            "Good morning",
            "يوم جميل",
            "美好的一天",
            "goedendag",
            "bonne journée",
            "καλημέρα",
            "יום טוב",
            "buongiorno",
            "良い一日",
            "buen día",
            "bra dag"
        ];
        if(o.message.match(/^((ban|bom|bum) dia|bundinha)$/i)) {
            e._disco.queueMessage(o.channelID, `<@${o.userID}> ${mornings[Math.floor(Math.random() * mornings.length)]}`);
        }
        cb();
    }, "start");

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

    e.register.addCommand(["blast", "pm"], ["nb.pm"], [
        {
            id: "user",
            type: "string",
            required: true
        }, {
            id: "subject",
            type: "string",
            required: true
        }, {
            id: "message",
            type: "rest",
            required: true
        }
    ], nbpm, "Send a PM");


    var login = JSON.parse(fs.readFileSync("./nb.json"));

    forum = new Forum(login.user, login.pass, function() {
        if(forum.ready) {
            pm = new PrivateMessage(forum);
            require("./lib/verify.js")(pm, e, callback);
        } else {
            callback();
        }
    });
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

function nbpm(e, args) {
    if(pm) {
        pm.send(args.user, args.subject, args.message).then(() => {
            e.respond("**Mensagem enviada**");
        }, () => {
            e.respond("**Falha ao enviar mensagem**");
        });
    } else {
        e.respond("**Não foi possível conectar com o fórum**");
    }
}
