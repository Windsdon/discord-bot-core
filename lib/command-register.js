var p = require("./params"),
    Params = p.Params,
    getHelp = p.getHelp;
var Permission = require("./permission").Permission;
var logger = require("winston");

var validCommandExpression = /^[A-Za-z0-9~\-!@#_]+$/;

/**
* This is the global command register
*/
function CommandRegister() {
    this.commands = {};
    this.hierarchy = {};
    this.validCommandExpression = validCommandExpression;
}

/**
* Creates a command object that can be passed to addCommand
* @param command string|array the command components
* @param permission array|Permission object, if array is given, the object is constructed here
* @param params array|Param object that this command expects
* @param action function called when this command executes
* @param help string the command help that triggers on wrong command or `help command`
*/
function Command(mod, command, permissions, params, action, help) {
    if(typeof command == "string") {
        command = [command];
    } else if(typeof(command) == "undefined") {
        throw new Error("Empty command!");
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

    if(permissions.constructor == Array) {
        permissions = new Permission(permissions);
    }

    if(!params) {
        params = new Params();
    }

    if(params.constructor == Array) {
        params = new Params(params);
    }

    if(!action) {
        //help command
        action = false;
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

Command.prototype.getHelp = function(activator) {
    return getHelp(this.command, activator, this.help, this.params);
};

Command.prototype.call = function (e, args) {
    if(typeof(this.action) != "function") {
        // do nothing for now
    } else {
        this.action(e, args);
    }
};

/**
* add a command to the register
* @param cmd Command object
*/
CommandRegister.prototype.addCommand = function(cmd) {
    if(!cmd) {
        throw new Error("Trying to add invalid command");
    }

    var h = this.hierarchy;
    cmd.command.forEach(function(v) {
        if(typeof(h[v]) == "undefined") {
            h[v] = {};
        }
        h = h[v];
    });

    logger.debug("Adding command " + cmd.getID());

    this.commands[cmd.getID()] = cmd;
}

CommandRegister.prototype.getSubFunctions = function (command) {
    var h = this.hierarchy;

    try {
        command.forEach(function(v) {
            if(typeof(h[v]) == "undefined") {
                throw {};
            }
            h = h[v];
        });
    } catch(e) {
        return false;
    }

    return Object.keys(h);
};

/**
* get a command by it's id
* @return Command|false
*/
CommandRegister.prototype.getCommand = function(id) {
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
    return parts.join(".");
}

/**
* checks if a command part is valid
*/
CommandRegister.prototype.isValidPart = function(part) {
    return this.validCommandExpression.test(part);
}

/**
* Returns a command factory that is passed to a plugin
*/
CommandRegister.prototype.getFactory = function(mod) {
    return new CommandFactory(mod, this);
}

function CommandFactory(mod, register) {
    this.mod = mod;
    this._register = register;
}

CommandFactory.prototype.addCommand = function (command, permissions, params, action, help) {
    this._register.addCommand(new Command(this.mod, command, permissions, params, action, help));
};

module.exports = CommandRegister
