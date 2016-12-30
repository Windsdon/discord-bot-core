"use strict";
const logger = require("winston");
const http = require('http');
const PORT = 32001;

var server = null;
var db = null;
var pm = null;
var _e = null;

function token() {
	return (new Array(17)).join("X").replace(/X/gi, function () {
		var k = "ABCDEFGHJIKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		return k[~~(Math.random() * k.length)];
	});
}

module.exports = function (pm_, e, callback) {
	callback = callback || function () { };


	pm = pm_;
	_e = e;
	db = e.db.getDatabase("verify");

	e.register.addCommand(["verify"], ["nb.verify.verify"], [
		{
			id: "user",
			type: "rest",
			required: true
		}
	], nbverify, "Verifica que você é um usuário no fórum");

	e.register.addCommand(["verifyset"], ["nb.verify.set"], [
		{
			id: "role",
			type: "role",
			required: true
		}
	], verifySetRole, "Define o rank de verificado");

	e.register.addCommand(["u"], ["nb.verify.view"], [
		{
			id: "user",
			type: "mention",
			required: false
		}
	], iduser, "Verifica quem é essa pessoa");

	server = http.createServer(handleRequest);
	server.listen(PORT, function () {
		logger.debug("Server listening on port " + PORT);
		callback();
	});
}

function verifySetRole(e, args) {
	e.db.getDatabase("verify").update({
		config: "role"
	}, {
			config: "role",
			value: args.role,
			sid: e.serverID,
			cid: e.channelID,
			uid: e.userID
		}, {
			upsert: true
		}, function (err, num) {
			if (err) {
				return e.respond(`**${err.message}**`);
			}

			e.respond(`**Rank verificado definido como <@&${args.role}>**`);
		});
}

function nbverify(e, args) {
	var random = token();

	var msg = `[b]Olá![/b]
O usuário ${e.user} (uid: ${e.userID}) no Discord mandou um pedido de confirmação de identidade para essa conta.
Se esse for seu usuário, [b][url=http://axel.windsdon.com:32001/${random}]clique aqui para confirmar[/url][/b].
Caso contrário. ignore essa mensagem.

[i]Beep boop, eu sou um bot![/i] Fale com o [url=http://forum.nintendoblast.com.br/u12119]@windsdon[/url] para mais informações.`;

	if (!pm) {
		return e.respond("**Não foi possível enviar mensagem: não autenticado");
	}

	pm.send(args.user, "Verificação de Identidade", msg).then(() => {
		e.db.getDatabase("verify").update({
			uid: e.userID
		}, {
				uid: e.userID,
				token: random,
				name: args.user,
				verified: false
			}, {
				upsert: true
			});
		e.respond("**Mensagem enviada**. Verifique suas mensagens no fórum para confirmar.");
	}).catch(err => {
		e.mention().respond("**Falha ao enviar**: Verifique seu o nome de usuário e tente novamente.");
	});
}

function iduser(e, args) {
	args.user = args.user || e.userID;

	e.db.getDatabase("verify").find({
		uid: args.user,
		verified: true
	}, function (err, docs) {
		if (!err && docs.length) {
			e.respond(`**${e.getName(args.user)}** é __**${docs[0].name}**__ no fórum.`);
		} else {
			e.respond(`**${e.getName(args.user)}** não foi verificado.`);
		}
	});
}

function handleRequest(request, response) {
	try {
		var token = request.url.match(/\/(.*)/)[1];
		db.find({
			token: token,
			verified: false
		}, function (err, data) {
			if (!err && data.length) {
				var u = data[0];
				db.find({
					config: "role"
				}, function (err, data) {
					if (!err && data.length) {
						var role = data[0].value;
						var sid = data[0].sid;
						var uid = data[0].uid;
						var cid = data[0].cid;
						var e = new (_e._disco.DiscordBotMessage)(_e._disco, "nb", sid, "", uid, cid, "", {});
						e.command(`mod role + ${role} uid:${u.uid} Verificação automática`, {
							_directives: {
								ignoreSelf: false,
								ignorePermissions: true
							}
						});
					}
				});

				db.update({
					token: token
				}, {
						$set: {
							verified: true
						}
					}, {});

				response.end('Verificado');
			} else {
				response.end('Token invalido');
			}
		});
	} catch (err) {
		response.end(err.message);
	}
}
