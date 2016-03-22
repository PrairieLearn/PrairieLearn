var hbs = require('hbs');

module.exports = {
    init: function() {
        hbs.registerHelper('ifEqual', function(var1, var2, context) {
            if (var1 == var2) {
                return context.fn(this);
            }
        });
    },
};
