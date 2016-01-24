var DiscordBot = require("./lib/discord-bot");
var logger = require("winston");
var fs  = require("fs");

var now = new Date();
var t = now.toISOString().replace(/[:.]/gi, '-');
var fname = './log/' + t + '.log';
try {
    fs.mkdirSync('./log');
} catch(e) {

}

logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {colorize: true});
logger.add(logger.transports.File, {
    level: 'debug',
    filename: fname
});
logger.level = 'debug';

var disco = new DiscordBot();
