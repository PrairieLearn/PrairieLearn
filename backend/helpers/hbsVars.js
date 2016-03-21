var hbs = require('hbs');

module.exports = {
    init: function() {
        var vars = {};

        hbs.registerHelper('setVar', function(name, context) {
            vars[name] = context.fn(this);
        });

        hbs.registerHelper('getVar', function(name) {
            return vars[name];
        });
    },
};
