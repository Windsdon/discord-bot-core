/**
* This is the parameter descriptor
* Format for options elements:
* id: the name for this param. Alphanumeric.
* type: a key from paramTypes
* options: passed to the paramType handler
*
* @param options array The expected options
*/
function Params(options) {

}

/**
* Extracts params from the string using the correct handler
* Returns false if required args are not present or if the string is
* not formatted. After the last argument is extracted, the remaining of
*
* the string will be added to the "_" property of the returned object
* @param string string The message
* @return object|false
*/
Params.prototype.get = function(string) {

}


/**
* ParamTypes extract their type from the string
*/
var paramTypes = {
    number: function(string, options) {

    },
    string: function(string, options) {

    },
    mention: function(string, options) {

    }
}

module.exports = {
    Params: Params,
    paramTypes: paramTypes
}
