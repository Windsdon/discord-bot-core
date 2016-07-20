"use strict";

var cheerio = require('cheerio');
var request = require("request");
var logger = require('winston');
var toMarkdown = require('to-markdown');
var striptags = require('striptags');

// posts per page
var ppp = 15;
var base = "http://forum.nintendoblast.com.br/";

class Post {
    constructor(obj) {
        var content = obj.find('.postbody>.content').html();
        this.content = striptags(toMarkdown(content));
        this.title = obj.find('.topic-title').text();
        this.id = obj.attr('class').match(/post--(\d+)/)[1];

        var userInfo = obj.find('.postprofile');
        var username = userInfo.find('dt').text();
        var userid = userInfo.find('dt>a').first().attr('href').replace("/", "");
        var status = userInfo.find('dd>font').first().text();
        var extra = userInfo.find('dd').eq(2).text();
        var karma = extra.match(/Karma *: *(\d+)/i)[1];
        var posts = extra.match(/Posts *: *(\d+)/i)[1];
        var avatar = userInfo.find('dl img').eq(0).attr('src');

        this.user = {
            name: username,
            id: userid,
            status: status,
            karma: karma,
            posts: posts,
            avatar: avatar
        }
    }
}

class Thread {
    constructor(id) {
        var matched = id.match(/\/?(t\d+)(?:p(\d+))?([0-9a-z\-]+).*(?:#(\d+))/);
        if(!matched) {
            throw new Error("Cannot parse thread id");
        }

        this.tid1 = matched[1];
        this.tid2 = matched[3];

        if(matched[2]) {
            this.linkedPage = matched[2];
        }

        if(matched[4]) {
            this.linkedPost = matched[4];
        }

        this.permalink = `${base}${this.tid1}${this.linkedPage ? "p" + this.linkedPage : ""}${this.tid2}${this.linkedPost ? "#" + this.linkedPost : ""}`;
    }

    // returns a promise to the linked post
    linked() {
        var self = this;
        return new Promise(function(resolve, reject) {
            self.page(self.linkedPage).then(posts => {
                var list = posts.filter(p => {
                    return p.id == self.linkedPost;
                });
                if(list.length == 1) {
                    resolve(list[0]);
                } else {
                    reject(new Error("Can't find post!"));
                }
            }).catch(reject);
        });
    }

    // returns a promise to a post object
    post(number) {
        var self = this;
        return new Promise(function(resolve, reject) {
            self.page(Math.floor(number)).then(posts => {
                resolve(posts[0]);
            }).catch(reject);
        });
    }

    // returns a promise to an array of up to `ppp` posts
    page(offset) {
        var url = `${base}${this.tid1}${offset ? "p" + offset : ""}${this.tid2}`;

        return new Promise(function(resolve, reject) {
            request.get(url, function(err, res, body) {
                try {
                    if(err) {
                        reject(err);
                        return;
                    }

                    var $ = cheerio.load(body);
                    var pElem = $(".post");
                    var pList = [];

                    pElem.each((i, p) => {
                        try {
                            var post = new Post($(p));
                            pList.push(post);
                        } catch (err) {
                        }
                    });

                    if(pList.length == 0) {
                        return reject(new Error("Empty thread"));
                    }

                    resolve(pList);
                } catch(err) {
                    reject(err);
                }
            });
        });
    }
}


module.exports = Thread;
