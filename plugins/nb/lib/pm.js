"use strict";
var cheerio = require('cheerio');
var request = require("request");
var logger = require('winston');
var fs = require("fs");

var base = "http://forum.nintendoblast.com.br/";

class PrivateMessage {
    constructor(forum) {
        this.forum = forum;
    }

    get() {

    }

    send(user, subject, message) {
        var self = this;

        return new Promise(function(resolve, reject) {
            self.forum.request.get({
                url: "http://forum.nintendoblast.com.br/privmsg?mode=post"
            }, function(err, res, body) {
                var fields = body.match(/<fieldset class="submit-buttons">(.*)name="lt"/);

                if(!fields) {
                    return reject(new Error("Can't load fields"));
                }
                var fields = fields[1].match(/name="auth\[]" value="(\w+)".*name="auth\[]" value="(\w+)".*name="new_pm_time" value="(\w+)"/);

                var time = fields[3];
                var auth = [fields[1], fields[2]];
                self.forum.request.post({
                    url: "http://forum.nintendoblast.com.br/privmsg",
                    formData: {
                        username: [user],
                        subject: subject,
                        message: message,
                        auth: auth,
                        folder: "",
                        mode: "post",
                        new_pm_time: time,
                        lt: "",
                        post: "Enviar",
                        attach_sig: "on"
                    }
                }, function(err, res, body) {
                    if(body.indexOf("A sua mensagem foi enviada") != -1) {
                        resolve();
                    } else {
                        reject(new Error("Falha ao enviar"));
                    }
                })
            });
        });
    }
}

module.exports = PrivateMessage;
