var Promise = require('bluebird');
var models = require('./models');

module.exports = {
    init: function(callback) {
        models.sequelize.sync().then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
