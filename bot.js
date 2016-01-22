var DiscordBot = require("./lib/discord-bot");
var logger = require("winston");

logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {colorize: true});
logger.level = 'debug';

var disco = new DiscordBot();
