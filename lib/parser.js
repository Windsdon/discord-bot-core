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
* @return object|false
*/
Parser.prototype.parse = function(message) {
    // test for activator string
    if(message.indexOf(this.activator) != 0) {
        return false;
    }

    // the command part of the message
    var c = message.substring(this.activator.length);

    if(c.length == 0) {
        return false;
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
        if(q !== false) {
            // what a terrible hack
            return {
                command: {
                    getHelp: function(activator) {
                        return getHelp(parts, activator, "", `<${q.join("|")}>`);
                    }
                },
                params: false
            };

        }
        return false;
    }

    var params = command.params.get(argstr);

    return {
        command: command,
        params: params
    }
}

module.exports = Parser;
