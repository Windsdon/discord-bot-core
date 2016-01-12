var Params = require("./params");
var Permission = require("./permission");
var logger = require("winston");

var validCommandExpression = /^[A-Za-z0-9~\-!@#_]+$/;

/**
* This is the global command register
*/
function CommandRegister() {
    this.commands = {};
    this.validCommandExpression = validCommandExpression;
}

/**
* Creates a command object that can be passed to addCommand
* @param command string|array the command components
* @param permission Permission object
* @param params Param object that this command expects
* @param action function called when this command executes
* @param help string the command help that triggers on wrong command or `help command`
*/
function Command(command, permissions, params, action, help) {
    if(typeof command == "string") {
        command = [command];
    }

    //validate command components
    for(var i = 0; i < command.length; i++) {
        if(!validCommandExpression.test(command[i])) {
            throw new Error("Invalid command: '" + command[i] + "'");
        }
    }

    if(!permissions) {
        permissions = new Permission();
    }

    if(!params) {
        params = new Params();
    }

    if(!action) {
        //useless command?
        action = function(){};
    }

    if(!help) {
        help = "";
    }

    this.command = command;
    this.permissions = permissions;
    this.params = params;
    this.action = action;
    this.help = help;
}

Command.prototype.getID = function() {
    return this.command.join(".");
}

/**
* add a command to the register
* @param cmd Command object
*/
CommandRegister.prototype.addCommand = function(cmd) {
    if(!cmd) {
        throw new Error("Trying to add invalid command");
    }

    this.commands[cmd.getID()] = cmd;
}

/**
* get a command by it's id
* @return Command|false
*/
CommandRegister.prototype.getCommand = function(id) {
    logger.debug("Looking for " + id + " in the register");
    if(this.commands[id]) {
        return this.commands[id];
    } else {
        return false;
    }
}

/**
* get id from command parts
*/
CommandRegister.prototype.getID = function(parts) {
    logger.debug("ID for " + parts + " is " + parts.join("."));
    return parts.join(".");
}

/**
* checks if a command part is valid
*/
CommandRegister.prototype.isValidPart = function(part) {
    return this.validCommandExpression.test(part);
}

module.exports = {
    CommandRegister: CommandRegister,
    Command: Command
}
