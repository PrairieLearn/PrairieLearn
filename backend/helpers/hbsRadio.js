var hbs = require('hbs');
var _ = require('underscore');

module.exports = {
    init: function() {
        var radios = {};

        hbs.registerHelper('setRadio', function(name, key) {
            radios[name] = radios[name] || {};
            _(radios[name]).each(function(v, k) {radios[name][k] = false;});
            radios[name][key] = true;
        });

        hbs.registerHelper('getRadio', function(name, key) {
            if (radios[name])
                return radios[name][key]
            else
                return undefined;
        });

        hbs.registerHelper('ifRadio', function(name, key, context) {
            if (radios[name] && radios[name][key])
                return context.fn(this);
            else
                return undefined;
        });
    },
};
