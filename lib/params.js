var logger = require("winston");
/**
* This is the parameter descriptor
* Format for options elements:
* id: the name for this param. Alphanumeric.
* type: a key from paramTypes
* options: passed to the paramType handler
* required: bool if this is a required param
*
* @param options array The expected options
*/
function Params(options) {
    if(!options) {
        options = {};
    }

    this.options = options;
}

/**
* Extracts params from the string using the correct handler
* Returns false if required args are not present or if the string is
* not well formatted. After the last argument is extracted, the remainder of
* the string will be added to the "_str" property of the returned object
*
* @param string string The message
* @return object|false
*/
Params.prototype.get = function(string) {
    var o = {};
    for(var i in this.options) {
        var option = this.options[i];
        if(!paramTypes[option.type]) {
            logger.debug("Invalid param type: " + option.type);
            if(option.required) {
                return false;
            }
            continue;
        }
        try {
            if(typeof(paramTypes[option.type]) == "function") {
                var r = paramTypes[option.type](string, option.options);
            } else {
                var r = paramTypes[option.type].get(string, option.options);
            }
            o[this.options[i].id] = r.val;
            string = r.string;
        } catch(e) {
            logger.debug(e);
            if(option.required) {
                return false;
            }
        }
    }

    o["_str"] = string;

    return o;
}

Params.prototype.getHelp = function () {
    var str = "";
    for (var i in this.options) {
        if (this.options.hasOwnProperty(i)) {
            option = this.options[i];
            str += (option.required) ? "<" : "[";
            str += option.type + ":";
            if(!paramTypes[option.type]) {
                logger.debug("Invalid param type: " + option.type);
                str += "*invalid type*"
            } else {
                if(typeof(paramTypes[option.type]) == "object" && typeof(paramTypes[option.type].help) == "function") {
                    str += paramTypes[option.type].help(option);
                } else {
                    str += option.id;
                }
            }
            str += (option.required) ? "> " : "] ";
        }
    }
    return str;
};


/**
* ParamTypes extract their type from the string
* The returned string should remove the current param
* Return: {val: value, string: ...}
* @throws Error if can't get the value
* @return object
*/
var paramTypes = {
    number: function(string, options) {
        var numberExtractor = /^ *([0-9]*\.?[0-9.]*)( |$)/;
        var numstr = string.match(numberExtractor);

        if(!numstr || isNaN(Number(numstr[1]))) {
            throw new Error("Invalid number");
        }

        var str = numstr[1];
        var num = Number(str);
        var rest = string.substring(string.indexOf(str) + str.length);
        return {
            val: num,
            string: rest
        }
    },
    string: function(string, options) {
        var quotedString = /^ *("(\\"|[^"])*"|[^ ]+)/;
        var str = string.match(quotedString);
        if(!str) {
            throw new Error("Invalid string");
        }

        var k = str[1];
        var rest = string.substring(string.indexOf(k) + k.length);

        if(k[1] == '"' && k[k.length - 1] == '"') {
            k = k.substring(1, k.length - 1);
        }
        return {
            val: k,
            string: rest
        }

    },
    mention: function(string, options) {
        var mentionExtractor = /^( *<@([0-9]+)>)( |$)/;
        var idstr = string.match(mentionExtractor);

        if(!idstr) {
            throw new Error("Invalid mention");
        }

        var k = idstr[2];
        var rest = string.substring(idstr[0].length);

        return {
            val: k,
            string: rest
        }
    },
    choice: {
        help: function(o) {
            return o.options.list.join("|");
        },
        get: function(string, options) {
            var p = string.indexOf(" ");
            var word = string.substring(0, p == -1 ? undefined : p);
            var rest = word.substring(p + 1);

            if(options.list.indexOf(word) == -1) {
                throw new Error("Not a valid option");
            }

            return {
                val: word,
                string: rest
            };

        }
    }
}

function getHelp(parts, activator, help, params) {
    var str = "";
    if(!activator) {
        activator = "";
    }
    var paramStr = (typeof(params) == "string" ? params : params.getHelp());
    str += `Usage: \`${activator + parts.join(" ") + " " + paramStr}\``;
    if(help != "") {
        str += "\n\n" + help;
    }

    return str;
}

module.exports = {
    Params: Params,
    paramTypes: paramTypes,
    getHelp: getHelp
}
