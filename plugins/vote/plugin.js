var logger = require("winston");
var crypto = require("crypto");
var async = require("async");

module.exports = {
    version: "0.1.0",
    name: "Voting",
    author: "Windsdon",
    init: VoteMod
}

function VoteMod(e, callback) {
    this.db = e.db.getDatabase("votes");

    this.STATUS_CREATED = "created";
    this.STATUS_STARTED = "started";
    this.STATUS_FINISHED = "finished";

    this.defaultSettings = {
        openVote: false, // show who voted for what at the end
        timeLimit: -1, //in seconds
        partialResults: false, // allow showing results while the vote is running
        barSize: 20, // size of the thing
        allowMultiple: false, // alow voting on multiple options
        feedback: false,
        remindInterval: -1,
        live: false
    };

    e.register.addCommand(["vote", "create"], ["vote.create"], [
        {
            id: "title",
            type: "string",
            required: true
        },
        {
            id: "options",
            type: "multistr",
            required: true
        }
    ], voteCreate, "Create a new vote");

    e.register.addCommand(["vote", "set"], ["vote.create"], [
        {
            id: "name",
            type: "choice",
            options: {
                list: Object.keys(this.defaultSettings)
            },
            required: true
        },
        {
            id: "value",
            type: "string",
            required: true
        },
        {
            id: "id",
            type: "string",
            required: false
        }
    ], voteSet, "Change vote settings. If no id is specified, will try to edit the last vote created on this channel");

    e.register.addCommand(["vote", "start"], ["vote.start"], [
        {
            id: "id",
            type: "string",
            required: false
        }
    ], voteStart, "Start a vote. If no id is specified, will try to use the last vote created on this channel");

    e.register.addCommand(["vote"], ["vote.vote"], [
        {
            id: "option",
            type: "number",
            required: true
        },
        {
            id: "id",
            type: "string",
            required: false
        }
    ], vote, "Vote on something. If no id is given, uses the current active vote. Can be used on private messages with the bot.");

    e.register.addCommand(["vote", "remind"], ["vote.remind"], [], voteRemind, "Show active vote information");

    e.register.addCommand(["vote", "end"], ["vote.end"], [
        {
            id: "id",
            type: "string",
            required: false
        }
    ], voteEnd, "End a vote. If no id is given, uses the current active vote.");

    e.register.addCommand(["vote", "results"], ["vote.results"], [
        {
            id: "id",
            type: "string",
            required: false
        }
    ], voteResults, "Show results. If no id is given, uses the current active vote.");

    callback();
}

function voteCreate(e, args) {
    e.mod.createVote(args.title, args.options, e.serverID, e.channelID, e.userID, (err, obj) => {
        if(err) {
            e.mention().text("Something went wrong while creating this vote").code(err.message).respond();
            return;
        }

        var opts = `${obj.title}\n`;

        obj.options.forEach((v, i) => {
            opts += `    ${i + 1}. ${v}\n`;
        });

        e.mention().text(`Created vote \`${obj.id}\`:`).code(opts);
        if(obj.serverID == "0") { // we created this via pm
            e.text(`Start it by doing \`(call) vote start ${obj.id}\` on some channel`);
        } else {
            e.text(`Start it by doing \`${e.activator}vote start\``);
        }
        e.respond();
    })
}

function voteRemind(e, args) {
    e.mod.getActiveVote(e.channelID, function(err, data) {
        if(err) {
            e.mention().text("Something went wrong!").code(e.message).respond();
            return;
        }

        if(data.length == 0) {
            e.mention().respond(`No active votes on this channel`);
            return;
        }

        var obj = data[0];

        var str = "```\n";
        str += `${obj.title}\n\n`;
        obj.options.forEach((v, i) => {
            str += `  ${i + 1}. ${v}\n`;
        });

        str += "\n";
        str += `You can vote by doing "${e.activator}vote <NUMBER>" here or by sending this bot a PM with "${e.globalActivator}vote <NUMBER> ${obj.id}"\n`
        if(obj.settings.allowMultiple) {
            str += `You can vote in more than one option by doing the command multiple times\n`
        } else {
            str += `You can only vote on one option\n`
        }

        if(obj.settings.openVote) {
            str += `This vote is open. This means everyone will be able to see who voted on what at the end\n`
        }

        if(obj.settings.timeLimit > 0) {
            var left = obj.settings.timeLimit * 1000 - (new Date()).getTime() + obj.started;
            str += `TIME LEFT TO VOTE: ${formatTime(left)}\n`
        }
        str += `\n\nCreated by ${e.getName(obj.creator)} with ID: ${obj.id}\n`;
        // str += crypto.randomBytes(8).toString('hex');
        str += "```"

        e.respond(str);
    });
}

function voteStart(e, args) {
    var set = {};

    set['serverID'] = e.serverID;
    set['channelID'] = e.channelID;
    set['started'] = (new Date()).getTime();
    set['status'] = e.mod.STATUS_STARTED;

    function start(obj) {
        e.mod.getActiveVote(e.channelID, function(err, data) {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(data.length != 0) {
                e.mention().respond(`Only one vote can be active at a time! End vote \`${data[0].id}\` before starting this one.`);
                return;
            }

            e.mod.set(obj.id, set, (err, num) => {
                if(err) {
                    e.mention().text("Something went wrong!").code(e.message).respond();
                    return;
                }

                e.mention().respond(`Starting vote \`${obj.id}\``);

                if(obj.settings.timeLimit > 0) {
                    setTimeout(function() {
                        // fix response channel
                        e.channelID = obj.channelID;
                        e.respond("Time's up! Let's see the results!");
                        voteEnd(e, {
                            id: obj.id
                        });
                    }, obj.settings.timeLimit * 1000);
                }

                if(obj.settings.remindInterval > 0) {
                    async.during(function(callback) {
                        e.mod.getVote(obj.id, function(err, data) {
                            if(err) {
                                callback(err);
                                return;
                            }

                            if(data.length == 0) {
                                callback(null, false);
                                return;
                            }

                            if(data[0].status != e.mod.STATUS_STARTED) {
                                callback(null, false);
                                return;
                            }

                            callback(null, true);
                        });
                    }, function(callback) {
                        voteRemind(e);
                        setTimeout(callback, obj.settings.remindInterval * 1000);
                    })
                } else {
                    voteRemind(e);
                }

            });
        });
    }

    if(!args.id) {
        e.mod.getLastVoteCreated(e.channelID, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("No votes created here");
                return;
            }

            obj = obj[0];

            start(obj);
        });
    } else {
        e.mod.getVote(args.id, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("That id is invalid");
                return;
            }

            obj = obj[0];

            if(obj.status != e.mod.STATUS_CREATED) {
                e.mention().respond("That vote is in progress or already over. You can only start new votes.");
                return;
            }

            start(obj);
        })
    }
}

function voteSet(e, args) {
    if(args.value == "true") {
        args.value = true;
    } else if(args.value == "false") {
        args.value = false;
    } else {
        var value = parseInt(args.value);
        if(!isNaN(value)) {
            args.value = value;
        }
    }

    var set = {};
    set[`settings.${args.name}`] = args.value;

    if(!args.id) {
        e.mod.getLastVoteCreated(e.channelID, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("No votes created here");
                return;
            }

            obj = obj[0];

            e.mod.set(obj.id, set, (err, num) => {
                if(err) {
                    e.mention().text("Something went wrong!").code(e.message).respond();
                    return;
                }

                if(num == 0) {
                    e.mention().respond(`Nothing changed`);
                } else {
                    e.mention().respond(`Changed \`${args.name}=${args.value}\` on \`${obj.id}\``);
                }
            });
        });
    } else {
        e.mod.set(args.id, set, (err, num) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(num == 0) {
                e.mention().respond(`Nothing changed`);
            } else {
                e.mention().respond(`Changed \`${args.name}=${args.value}\` on \`${args.id}\``);
            }

        });
    }
}

function vote(e, args) {
    function doVote(obj) {

        if(args.option < 1 || args.option > obj.options.length) {
            e.mention().respond("That option is invalid!");
            return;
        }

        args.option -= 1; // noobs

        if(typeof(obj.votes[e.userID]) == "undefined") {
            obj.votes[e.userID] = [];
        }

        if(obj.votes[e.userID].indexOf(args.option) != -1) {
            if(obj.settings.feedback) {
                e.mention().respond("You already voted on that!");
            }
            return;
        }

        if(!obj.settings.allowMultiple && obj.votes[e.userID].length > 0) {
            obj.votes[e.userID][0] = args.option;
        } else {
            obj.votes[e.userID].push(args.option);
        }

        var set = {};
        set[`votes.${e.userID}`] = obj.votes[e.userID];
        e.mod.set(obj.id, set, function(err, data) {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.settings.feedback) {
                e.mention().respond("Vote registered");
            }
        });
    }

    if(!args.id) {
        e.mod.getActiveVote(e.channelID, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("No votes active here!");
                return;
            }

            obj = obj[0];

            doVote(obj);
        });
    } else {
        e.mod.getVote(args.id, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("That id is invalid");
                return;
            }

            obj = obj[0];

            if(obj.status != e.mod.STATUS_STARTED) {
                e.mention().respond("That vote is not running right now.");
                return;
            }

            doVote(obj);
        })
    }
}

function voteEnd(e, args) {
    function endVote(obj) {
        var set = {};
        set['ended'] = (new Date()).getTime();
        set['status'] = e.mod.STATUS_FINISHED;
        e.mod.set(obj.id, set, function(err, data) {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            e.mention().respond("Ending vote");

            args.id = obj.id;

            voteResults(e, args);
        })
    }

    if(!args.id) {
        e.mod.getActiveVote(e.channelID, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("No votes active here!");
                return;
            }

            obj = obj[0];

            endVote(obj);
        });
    } else {
        e.mod.getVote(args.id, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("That id is invalid");
                return;
            }

            obj = obj[0];

            if(obj.status != e.mod.STATUS_STARTED) {
                e.mention().respond("That vote is not running right now.");
                return;
            }

            endVote(obj);
        })
    }
}

function voteResults(e, args) {
    function results(obj) {
        if(obj.status == e.mod.STATUS_STARTED && obj.settings.partialResults == false) {
            e.mention().respond("You can't get partial results for this one!");
            return;
        }

        if(obj.status == e.mod.STATUS_CREATED) {
            e.mention().respond("This vote hasn't started yet");
            return;
        }

        var str = "```\n";
        str += `${obj.title}\n\n`;
        e.mod.makeSameSize(obj.options);
        var totalVotes = 0;
        var totals = [];
        var voters = [];

        for (var i = 0; i < obj.options.length; i++) {
            totals.push(0);
            voters.push([]);
        }


        for (var uid in obj.votes) {
            if (obj.votes.hasOwnProperty(uid)) {
                obj.votes[uid].forEach(function(v, i) {
                    totals[v]++;
                    totalVotes++;
                    voters[v].push(uid);
                });
            }
        }

        if(totalVotes == 0) {
            totalVotes = 1;
        }

        var r = [];

        obj.options.forEach((v, i) => {
            r.push([
                totals[i],
                `${v} ${e.mod.makeProgressBar(obj.settings.barSize, totals[i]/totalVotes)} ${totals[i]}`
            ]);
        });

        r.sort(function(a, b) {
            return b[0] - a[0];
        });

        r.forEach(function(v, i) {
            if(i) {
                str += "\n";
            }
            str += v[1];
        });
        str += "\n\n";
        str += `Created by ${e.getName(obj.creator)} with ID: ${obj.id}\n`;
        if(obj.ended != null) {
            str += `Ended on ${(new Date(obj.ended)).toISOString()}\n`;
        }
        str += "\n```";

        e.respond(str);
    }

    if(!args.id) {
        e.mod.getActiveVote(e.channelID, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("No votes active here!");
                return;
            }

            obj = obj[0];

            results(obj);
        });
    } else {
        e.mod.getVote(args.id, (err, obj) => {
            if(err) {
                e.mention().text("Something went wrong!").code(e.message).respond();
                return;
            }

            if(obj.length == 0) {
                e.mention().respond("That id is invalid");
                return;
            }

            obj = obj[0];

            results(obj);
        })
    }
}

VoteMod.prototype.makeProgressBar = function (size, fraction) {
    if(fraction < 0) {
        fraction = 0;
    }
    var filled = Math.floor(size * fraction);
    if(fraction > 0 && filled == 0) {
        filled = 1;
    }
    var str = "";

    for (var i = 0; i < size; i++) {
        if(i < filled) {
            str += "|";
        } else {
            str += "-";
        }
    }

    return str;
};

VoteMod.prototype.makeSameSize = function (strs) {
    var maxSize = 0;
    strs.forEach((v) => {
        if(v.length > maxSize) {
            maxSize = v.length;
        }
    });

    for (var i = 0; i < strs.length; i++) {
        strs[i] = strs[i] + (new Array(maxSize - strs[i].length + 1)).join(" ");
    }
};

VoteMod.prototype.getID = function () {
    var alphabet = "abcdefghijlmnopqrstuvwxyz";

    var str = "";
    for (var i = 0; i < 8; i++) {
        str += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return str;
};

VoteMod.prototype.createVote = function (title, options, serverID, channelID, userID, callback) {
    if(typeof(options) != "object" && options.constructor != Array) {
        options = [];
    }

    this.db.insert({
        id: this.getID(),
        title: title,
        options: options,
        serverID: serverID,
        channelID: channelID,
        votes: {},
        settings: this.defaultSettings,
        creator: userID,
        created: (new Date()).getTime(),
        started: null,
        ended: null,
        status: this.STATUS_CREATED
    }, callback);
};

VoteMod.prototype.getVote = function (id, callback) {
    this.db.find({
        id: id
    }, callback);
};

VoteMod.prototype.getActiveVote = function (channelID, callback) {
    logger.debug(`Find ${channelID} and ${this.STATUS_STARTED}`);
    this.db.find({
        channelID: channelID,
        status: this.STATUS_STARTED
    }, callback);
};

VoteMod.prototype.getLastVoteCreated = function (channelID, callback) {
    this.db.find({
        channelID: channelID,
        status: this.STATUS_CREATED
    }).sort({
        created: -1
    }).exec(callback);
};

VoteMod.prototype.set = function (id, obj, callback) {
    this.db.update({
        id: id
    }, {
        $set: obj
    }, {}, callback);
};

function formatTime (millis) {
    var sec_num = Math.floor(millis / 1000);
    var millis  = millis % 1000;
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    var time    = `${hours}:${minutes}:${seconds}.${millis}`;
    return time;
}
