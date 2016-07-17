var logger = require("winston");

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function PokeGame(pokelist, db, channelID, data) {
    data = data || {};
    this.db  = db;

    this.pokelist = pokelist;

    this.data = {};

    this.data.channelID = channelID;

    //users: {uid, pokemon}
    this.data.users = data.users || {};

    this.data.order = data.order || [];

    this.data.id = data.id || (new Date()).getTime();

    this.data.started = data.started || false;
    this.started = this.data.started;

    this.data.rank = data.rank || []; // list of uids

    this.current = this.data.users[this.data.order[0]] || null;

    this.save();

}

PokeGame.prototype.start = function () {
    var self = this;
    self.data.order = [];
    for(var i in this.data.users) {
        var o = this.data.users[i];
        o.pokemon = self.pokelist[~~(Math.random() * self.pokelist.length)];
        self.data.order.push(o.uid);
    }
    shuffle(this.data.order);
    this.data.started = true;
    this.started = true;
    this.current = this.data.users[this.data.order[0]];
    this.save();
};

PokeGame.prototype.next = function () {
    this.data.order.unshift(this.data.order.pop());
    this.current = this.data.users[this.data.order[0]];
    this.save();
    return this.current;
};

PokeGame.prototype.join = function (userID) {
    this.data.users[userID] = {
        uid: userID,
        pokemon: false
    };
    this.save();
};

PokeGame.prototype.save = function () {
    this.db.update({
        id: this.data.id
    }, this.data, {
        upsert: true
    }, function(err) {
    })
};

PokeGame.prototype.correct = function () {
    this.data.rank.push(this.data.order.shift());
    if(this.data.order.length == 0 || this.data.rank.length == 3) {
        return true;
    } else {
        return false;
    }
};

var games = {};
var db;

function getGame(e) {
    if(!games[e.channelID]) {
        e.text("**[POKE]**").mention().respond("Crie um novo jogo com `poke create` antes!");
        return false;
    }

    var game = games[e.channelID];

    return game;
}

function pokeJoin(e, args) {
    var game = getGame(e);

    if(!game) {
        return;
    }

    if(game.started) {
        e.text("**[POKE]** ").mention().respond("Esse jogo já começou! Você não pode entrar agora!");
        return;
    }

    if(game.data.users[e.userID]) {
        e.text("**[POKE]** ").mention().respond("Você já entrou no jogo!");
        return;
    }

    game.join(e.userID);
    e.respond(`**[POKE] __${e.user}__ Entrou no jogo!** [${Object.keys(game.data.users).length}]`);
}

function pokeNext(e, args) {
    var game = getGame(e);

    if(!game) {
        return;
    }

    if(!game.started) {
        e.text("**[POKE]** ").mention().respond("Esse jogo ainda não começou! Use `poke start`!");
        return;
    }

    var next = game.next();

    e.text("**[POKE] É a vez de **").mention(next.uid).respond();
}

function pokeGuess(e, args) {
    var game = getGame(e);

    if(!game) {
        return;
    }

    if(game.current.uid != e.userID) {
        e.text("**[POKE]** ").mention().respond("Não é sua vez!");
        return;
    }

    if(!args.guess) {
        pokeNext(e, args);
        return;
    } else if(args.guess.toLowerCase() === game.current.pokemon.name.toLowerCase()) {
        e.text("**[POKE]** ").mention().respond("**__ACERTOU!__**");
        if(game.correct()) {
            var results = "";
            game.data.rank.forEach(function(v, i) {
                results += `**${i+1}º**: <@${v}>\n\n`;
            });

            e.text("**[POKE] __RESULTADOS__**\n\n").respond(results);
            games[e.channelID] = null;
        } else {
            pokeNext(e);
        }
    } else {
        e.text("**[POKE]** ").mention().respond("**__ERROU!__**")
        pokeNext(e);
    }
}

function pokeStart(e, args) {
    var game = getGame(e);

    if(!game) {
        return;
    }

    if(game.started) {
        e.text("**[POKE]**").mention().respond("Esse jogo já começou!");
        return;
    }

    if(Object.keys(game.data.users).length < 2) {
        e.text("**[POKE]**").mention().respond("São necessários ao menos 2 jogadores para começar o jogo!");
        return;
    }

    game.start();
    var players = "**[POKE] __LISTA DE JOGADORES__**\n\n";
    for(var i in game.data.users) {
        var v = game.data.users[i];
        var txt = "**[POKE] __LISTA DE JOGADORES__**\n\n";

        players += `**${e.getName(v.uid)}**\n`;

        for(var j in game.data.users) {
            if(i == j) {
                continue;
            }

            var vv = game.data.users[j];
            txt += `**${e.getName(vv.uid)}**: **__${vv.pokemon.name}__** ${vv.pokemon.link}\n`;
        }
        e.pm(txt, v.uid);
    }
    e.respond(players);
    pokeNext(e);
}

function pokeCreate(e, args) {
    var db = e.db.getDatabase("poke");
    games[e.channelID] = null;
    db.remove({
        channelID: e.channelID
    }, {
        multi: true
    }, function() {
        games[e.channelID] = new PokeGame(e.mod.poke.pokelist, db, e.channelID);
        e.respond("**[POKE] Jogo criado!**");
    });
}

function pokeSend(e, args) {
    var game = getGame(e);

    if(!game) {
        return;
    }

    if(!game.started) {
        e.text("**[POKE]** ").mention().respond("Esse jogo ainda não começou! Use `poke start`!");
        return;
    }
    var txt = "**[POKE] __LISTA DE JOGADORES__**\n\n";

    for(var j in game.data.users) {
        if(e.userID == j) {
            continue;
        }

        var vv = game.data.users[j];
        txt += `**${e.getName(vv.uid)}**: **__${vv.pokemon.name}__** ${vv.pokemon.link}\n`;
    }
    e.pm(txt, e.userID);
}

function pokeLeave(e, args) {
    var game = getGame(e);

    if(!game) {
        return;
    }

    if(game.data.users[e.userID]) {
        delete game.data.users[e.userID];
        var p = game.data.order.indexOf(e.userID);
        if(p == 0) {
            pokeNext(e, args);
            p = game.data.order.indexOf(e.userID);
        }
        if(p >= 0) {
            game.data.order.splice(p, 1);
        }
        game.save();
        e.respond(`**[POKE] __${e.user}__ Saiu no jogo!** [${Object.keys(game.data.users).length}]`);
    } else {
        e.text("**[POKE]** ").mention().respond("Você não está no jogo!");
    }
}

module.exports = function(e) {
    db = e.db.getDatabase("poke");
    this.pokelist = require("./data/poke.json");
    var self = this;
    db.find({}, function(err, docs) {
        if(docs) {
            docs.forEach(function(v) {
                games[v.channelID] = new PokeGame(self.pokelist, db, v.channelID, v);
            });
        }
    });
    e.register.addCommand(["poke", "join"], ["nb.game.poke.play"], [], pokeJoin, "Entrar no Que Pokémon Sou Eu?");
    e.register.addCommand(["poke", "guess"], ["nb.game.poke.play"], [
        {
            id: "guess",
            type: "string",
            required: false
        }
    ], pokeGuess, "Tenta adivinhar quando é sua vez");
    e.register.addCommand(["poke", "send"], ["nb.game.poke.play"], [], pokeSend, "Reenvia os nomes");
    e.register.addCommand(["poke", "leave"], ["nb.game.poke.play"], [], pokeLeave, "Sai do jogo");

    e.register.addCommand(["poke", "create"], ["nb.game.poke.create"], [], pokeCreate, "Cria um jogo");
    e.register.addCommand(["poke", "start"], ["nb.game.poke.create"], [], pokeStart, "Começa o jogo");
}
