
module.exports = {
    version: "1.0.0",
    name: "Base converter",
    author: "Windsdon",
    init: BaseConverter
}

function BaseConverter(e, callback) {

    var list = [];
    for (var i in ConvertBase) {
        list.push(i);
    }

    e.register.addCommand(["bases"], [], [
        {
            id: "conversion",
            type: "choice",
            options: {
                list: list
            },
            required: true
        },
        {
            id: "value",
            type: "string",
            required: true
        }
    ], convert, "Convert bases");

    callback();
}

function convert(e, args) {
    try {
        e.code(ConvertBase[args.conversion](args.value)).respond();
    } catch(err) {
        e.code(err.message).respond();
    }
}


(function(){
    var ConvertBase = function (num) {
        return {
            from : function (baseFrom) {
                return {
                    to : function (baseTo) {
                        return parseInt(num, baseFrom).toString(baseTo);
                    }
                };
            }
        };
    };

    // binary to decimal
    ConvertBase.bin2dec = function (num) {
        return ConvertBase(num).from(2).to(10);
    };

    // binary to hexadecimal
    ConvertBase.bin2hex = function (num) {
        return ConvertBase(num).from(2).to(16);
    };

    // decimal to binary
    ConvertBase.dec2bin = function (num) {
        return ConvertBase(num).from(10).to(2);
    };

    // decimal to hexadecimal
    ConvertBase.dec2hex = function (num) {
        return ConvertBase(num).from(10).to(16);
    };

    // hexadecimal to binary
    ConvertBase.hex2bin = function (num) {
        return ConvertBase(num).from(16).to(2);
    };

    // hexadecimal to decimal
    ConvertBase.hex2dec = function (num) {
        return ConvertBase(num).from(16).to(10);
    };

    this.ConvertBase = ConvertBase;

})(this);
