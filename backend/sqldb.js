var Promise = require('bluebird');
var models = require('./models');
var histogram = require('./sprocs/histogram');

module.exports = {
    init: function(callback) {
        Promise.try(function() {
            return models.sequelize.sync();
        }).then(function() {
            return models.sequelize.query(histogram.sql);
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
