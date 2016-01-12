// some testing stuff

var logger = require("winston");
var Parser = require("./lib/parser");
var CommandRegister = require("./lib/command-register").CommandRegister;
var Command = require("./lib/command-register").Command;
var Params = require("./lib/params").Params;
var Permission = require("./lib/permission");

// enable some fancy coloring
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {colorize: true});

logger.level = 'debug';

var register = new CommandRegister();
var parser = new Parser(register, "wind ");

var commandTest = new Command(["audio", "yt"], new Permission(["audio.yt"]), new Params([
    {
        id: "video",
        type: "string",
        required: true
    },
    {
        id: "after",
        type: "string",
        required: false
    }
]), function(o) {

}, "tests stuff");

register.addCommand(commandTest);

logger.debug("Register:", JSON.stringify(register.commands));

logger.debug("Parsed stuff", parser.parse("wind test a \"some stuff\" 123"));
