var logger = require("winston");
var getHelp = require("./params").getHelp;

/**
* Command parser
*
* @param register CommandRegister The global register
* @param activator string The message must begin with this to continue parsing
*/
function Parser(register, activator) {
    this.register = register;
    this.activator = activator;
}

/**
* Parses the message and return an object containing:
* command: Command object from the register
* params: params object returned by Params.get
* @param message string The raw message string
* @param e object the "o" object from the parsing process
* @return object|false
*/
Parser.prototype.parse = function(message, e) {
    // test for activator string
    if(message.toLowerCase().indexOf(this.activator.toLowerCase()) != 0) {
        return {
            error: {
                silent: true,
                displayHelp: false,
                message: "No call sign"
            }
        };
    }

    // the command part of the message
    var c = message.substring(this.activator.length);

    if(c.length == 0) {
        return {
            error: {
                silent: true,
                displayHelp: false,
                message: "Empty command"
            }
        };
    }

    var parts = [];
    var command = false;
    var argstr = "";

    // find the command
    do {
        // next stop
        var p = c.indexOf(" ");
        if (p == -1) {
            p = c.length;
        }
        var part = c.substring(0, p + 1).substring(0, p);
        if (!this.register.isValidPart(part)) {
            break;
        }
        parts.push(part);
        c = c.substring(p + 1);
        var cmd = this.register.getCommand(this.register.getID(parts));
        if(cmd) {
            argstr = c;
            command = cmd;
        }
    } while(c.length != 0);

    if(!command) {
        var q = this.register.getSubFunctions(parts);
        while(q === false && parts.length > 0) {
            parts.pop();
            q = this.register.getSubFunctions(parts);
        }
        if(q !== false && parts.length > 0) {
            // what a terrible hack
            return {
                error: {
                    displayHelp: true,
                    silent: false,
                    message: false,
                },
                command: {
                    getHelp: function(activator) {
                        return getHelp(parts, activator, "", `<${q.join("|")}>`);
                    }
                },
                params: null
            };

        }
        return {
            error: {
                silent: true,
                displayHelp: false,
                message: "Invalid command"
            }
        };
    }

    var params = command.params.get(argstr, e);

    return {
        error: params.error,
        command: command,
        params: params
    }
}

module.exports = Parser;
