"use strict";
var logger = require("winston");

function pickWeighted(o) {
    var sum = 0;
    for(var i in o) {
        if (o.hasOwnProperty(i)) {
            sum += o[i];
        }
    }

    var n = Math.random() * sum;

    for(var i in o) {
        if (o.hasOwnProperty(i)) {
            n -= o[i];
            if(n <= 0) {
                return i;
            }
        }
    }
}

class MarkovChain {
    constructor(order, cs) {
        this.order = order || 1;
        this.cs = !!cs;
        this.words = {};
        this.weights = [];

        for(var i = 0; i < this.order; i++) {
            this.weights.push(1);
        }
    }

    feed(str) {
        if(!this.cs) {
            str = str.toLowerCase();
        }
        var list = str.split(/\s+/).filter(v => v.length > 0);
        for(var i = 0; i < list.length; i++) {
            var token = "!" + list[i];
            var w = this.words[token];
            if(typeof(w) == "undefined") {
                w = {
                    count: 0,
                    p: []
                };
                this.words[token] = w;

                for (var j = 0; j < this.order; j++) {
                    w.p[j] = {};
                }
            }

            w.count++;
            for(var j = 1; j <= this.order; j++) {
                if(i - j >= 0) {
                    var u = "!" + list[i - j];
                    if(!w.p[j - 1][u]) {
                        w.p[j - 1][u] = 1;
                    } else {
                        w.p[j - 1][u]++;
                    }
                }
            }
        }
    }

    getNext(s) {
        var order = this.order;
        var words = this.words;
        var list = {};
        for(i in words) {
            list[i] = this.getWeight(i, s.slice(-order));
        }

        var k = pickWeighted(list);

        return k;
    }

    /**
    * Returns the weight for the word based on it's preceding values
    */
    getWeight(word, tokens) {
        if(!tokens || !tokens.length) {
            return 0;
        }
        var val = 0;
        var w = this.words[word];
        for(var i = 0; i < tokens.length; i++) {
            var wg = this.weights[i] || 0;
            var u = tokens[tokens.length - i - 1];
            var k = ((w.p[i] || [])[u] || 0);
            val += wg * k;
        }

        return val;
    }

    generate(options) {
        var sentence = options.start ? options.start.replace(/( +|^)/g, " !").split(/\s+/).filter(v => v.length > 0)
            : [Object.keys(this.words)[Math.floor(Math.random() * Object.keys(this.words).length)]];
        while(sentence.length < options.size) {
            sentence.push(this.getNext(sentence));
        }

        return sentence.join(" ").replace(/( |^)!/g, " ");
    }
}

module.exports = MarkovChain;
