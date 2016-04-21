var Promise = require('bluebird');
var models = require('./models');
var histogram = require('./sprocs/histogram');
var arrayHistogram = require('./sprocs/arrayHistogram');
var userTestScores = require('./sprocs/userTestScores');
var studentTestScores = require('./sprocs/studentTestScores');
var testStats = require('./sprocs/testStats');
var testInstanceDurations = require('./sprocs/testInstanceDurations');
var userTestDurations = require('./sprocs/userTestDurations');
var testDurationStats = require('./sprocs/testDurationStats');
var formatInterval = require('./sprocs/formatInterval');
var formatIntervalShort = require('./sprocs/formatIntervalShort');
var intervalHistThresholds = require('./sprocs/intervalHistThresholds');

module.exports = {
    init: function(callback) {
        Promise.try(function() {
            return models.sequelize.sync();
        }).then(function() {
            return models.sequelize.query(histogram.sql);
        }).then(function() {
            return models.sequelize.query(arrayHistogram.sql);
        }).then(function() {
            return models.sequelize.query(formatInterval.sql);
        }).then(function() {
            return models.sequelize.query(formatIntervalShort.sql);
        }).then(function() {
            return models.sequelize.query(intervalHistThresholds.sql);
        }).then(function() {
            return models.sequelize.query(userTestScores.sql);
        }).then(function() {
            return models.sequelize.query(studentTestScores.sql);
        }).then(function() {
            return models.sequelize.query(testStats.sql);
        }).then(function() {
            return models.sequelize.query(testInstanceDurations.sql);
        }).then(function() {
            return models.sequelize.query(userTestDurations.sql);
        }).then(function() {
            return models.sequelize.query(testDurationStats.sql);
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
