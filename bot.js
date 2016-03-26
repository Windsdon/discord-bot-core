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
logger.add(logger.transports.Console, {
    colorize: true,
    handleExceptions: true
});
logger.add(logger.transports.File, {
    level: 'debug',
    filename: fname,
    handleExceptions: true
});
logger.level = 'debug';

logger.handleExceptions(new logger.transports.File({ filename: './crash.log' }));

var disco = new DiscordBot();
