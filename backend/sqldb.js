var Promise = require('bluebird');
var models = require('./models');
var histogram = require('./sprocs/histogram');
var testStats = require('./sprocs/testStats');

module.exports = {
    init: function(callback) {
        Promise.try(function() {
            return models.sequelize.sync();
        }).then(function() {
            return models.sequelize.query(testStats.sql);
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
