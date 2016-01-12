var logger = require("winston");

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
    logger.debug("Parsing", message);

    // test for activator string
    if(message.indexOf(this.activator) != 0) {
        logger.debug("No activator");
        return false;
    }

    // the command part of the message
    var c = message.substring(this.activator.length);

    if(c.length == 0) {
        return false;
    }

    var parts = [];
    var command = false;

    // find the command
    do {
        // next stop
        var p = c.indexOf(" ");
        if (p == -1) {
            p = c.length;
        }
        var part = c.substring(0, p + 1).substring(0, p);
        logger.debug("Part:", part);
        if (!this.register.isValidPart(part)) {
            logger.debug("This part is invalid");
            break;
        }
        parts.push(part);
        c = c.substring(p + 1);
        logger.debug("What was left of the string:", c);
        command = this.register.getCommand(this.register.getID(parts));
        logger.debug("Command:", command);
    } while(!command && c.length != 0);

    if(!command) {
        return false;
    }

    var params = command.params.get(c);

    // params can be an empty object
    if(params === false) {
        return false;
    }

    return {
        command: command,
        params: params
    }
}

module.exports = Parser;
