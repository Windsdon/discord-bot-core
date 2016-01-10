/**
* This is the global command register
*/
function CommandRegister() {
    this.commands = {};
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
        if(!/^[A-Za-z0-9~\-!@#_]$/.test(command[i])) {
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

}

/**
*
*/

module.exports = {
    CommandRegister: CommandRegister,

}
