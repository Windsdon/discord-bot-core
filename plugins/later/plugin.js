var logger = require("winston");
var async = require("async");
var request = require("request");
var fs = require("fs");

module.exports = {
    version: "1.0.0",
    name: "Later",
    author: "Windsdon",
    init: LaterMod
}

var images = ["TpKZIF4.jpg", "89FPHlL.jpg", "YzYjaYR.jpg", "gqFvqPg.jpg", "PbXhpE1.jpg", "zAGzpQg.jpg", "vSliSaJ.jpg", "sYDIWWS.jpg", "KU6K3d8.jpg", "ZcqI9KQ.jpg", "tNhf1S4.jpg", "zN8vi66.jpg", "k3PrVvI.jpg", "Z8dsm9J.jpg", "meTcvwA.jpg", "uU3FdRP.jpg", "Dwd4DxL.jpg", "EqV5DO6.jpg", "Fyv7Wyw.jpg", "e6zYE9f.jpg", "sQvvtST.jpg", "AKQtF0K.jpg", "cVVdHPX.jpg", "lnytv0g.jpg", "XVBw40Y.jpg", "eWNyMxn.jpg", "dVUbDoH.jpg", "OwGIdqX.jpg", "Fr18An6.jpg", "IcBZPwe.jpg", "Sluf5bJ.jpg", "ncfSJT1.jpg", "kU2YTWp.jpg", "Genr8PP.jpg", "7Y1kaaX.png", "szXlFJq.jpg", "F8Wrdow.jpg", "vi14kWO.jpg", "iUJU3GB.jpg", "U37SVGF.jpg", "iM1v7hR.jpg", "KfaXx3r.jpg", "PMvEalE.jpg", "tgXJz7D.jpg", "ktG1dyE.jpg", "W8TaZ0h.jpg", "fqT1U7O.jpg", "uDkkDXJ.jpg", "KC54v1s.jpg", "4gUW9C2.jpg", "2l4DFcT.jpg", "5KvKPOQ.jpg", "6kfnxBt.jpg", "mfzpuPz.jpg", "7oTXPV0.jpg", "Y54ZgsH.jpg", "p4LUcXE.jpg", "ESI83wD.jpg", "a4ODRYk.jpg", "IhIJ9vA.jpg", "vgk3MTB.png", "HlKKgRg.jpg", "zWg6Wi1.png", "4ZimPjF.jpg", "y0UoSjv.jpg", "LOZeb6P.png", "yvfJp3J.png", "yCv1knn.jpg", "uECtTww.jpg", "4q82js3.jpg", "PGFw9Gc.jpg", "9M4RUV5.jpg", "p5JZDov.png", "o38SbDG.jpg", "yiNmZge.png", "DzBvdNl.png", "GvlgY3h.jpg", "oBCzMzH.jpg", "r34MFDK.png", "Wma3dbT.png", "tTDthms.png", "RvSnP4u.png", "9qe4O99.jpg", "uEVE4mG.jpg", "mk9a0kO.png", "U4vgbFm.png", "A6wG0Lt.png", "yeWXgM7.png", "Ma3z2Rt.png", "LYLqgs2.png", "HzDtFHE.png", "k8kjv3l.png", "iadOCnw.png", "iNi2Oq1.png", "WGv5jQb.png", "vTfx3ou.png", "K7pGyfo.png", "4dfIHMs.png", "yfKhSe0.png", "s4btMze.png", "vm0xand.png", "kiypktp.png", "SAzcH3x.png", "w3FsqQS.png", "kEQzDsS.png", "HyR4Oeq.png", "xsFj3fS.png", "t6ZDSyL.jpg", "AScw8w4.jpg"];

function LaterMod(e, callback) {
    e.register.addCommand(["later"], ["later.later"], [], later, "10 hours later...", {
        enableAll: true
    });
    e.register.addCommand(["later", "refresh"], ["later.refresh"], [], laterRefresh, "Download all images");
    callback();
}

function later(e, args) {
    var p = e.db.getStoragePath("images");
    fs.readdir(p, (err, files) => {
        if(err) {
            logger.error(err);
            return;
        }

        files = files.filter(f => images.indexOf(f) != -1);

        if(files.length == 0) {
            return e.respond("No images loaded! Run `later refresh`");
        }

        e.respondFile(p + "/" + files[Math.floor(Math.random() * files.length)]);
    });
}

function laterRefresh(e, args) {
    var path = e.db.getStoragePath("images");
    var queue = async.queue(function(task, callback) {
        var fpath = path + "/" + task;
        var stream = request("http://i.imgur.com/" + task).on('response', function(response) {
            if(response.statusCode != 200) {
                e.respond(task + ": That link is invalid - Status Code: " + response.statusCode);
                callback();
            } else {
                stream.pipe(fs.createWriteStream(fpath)).on('finish', function () {
                    logger.debug("Downloaded: " + task);
                    callback();
                });
            }
        });
    }, 10);
    queue.drain = function() {
        e.respond("Finished downloading " + images.length + " images");
    };
    queue.push(images);
    e.respond("Loading " + images.length + " images");
}
