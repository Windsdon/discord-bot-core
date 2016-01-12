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
* not well formatted. After the last argument is extracted, the remaining of
* the string will be added to the "_" property of the returned object
*
* @param string string The message
* @return object|false
*/
Params.prototype.get = function(string) {
    logger.debug(JSON.stringify(this));
    logger.debug("Message is: " + string);
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
            var r = paramTypes[option.type](string, option.options);
            logger.debug("Extracted", r);
            o[this.options[i].id] = r.val;
            string = r.string;
        } catch(e) {
            logger.debug("Error while parsing: " + e.message);
            if(option.required) {
                return false;
            }
        }
    }

    return o;
}


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

        if(!numstr || isNaN(Number(numstr[0]))) {
            throw new Error("Invalid number");
        }

        var str = numstr[0];
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
        var k = str[0];
        var rest = string.substring(string.indexOf(k) + k.length);

        if(k[0] == '"' && k[k.length - 1] == '"') {
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

        var k = str[1];
        var rest = string.substring(k.length);

        return {
            val: k,
            string: rest
        }
    }
}

module.exports = {
    Params: Params,
    paramTypes: paramTypes
}
