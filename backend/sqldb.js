var fs = require('fs');
var Promise = require('bluebird');
var models = require('./models');
var histogram = require('./sprocs/histogram');
var arrayHistogram = require('./sprocs/arrayHistogram');
var formatInterval = require('./sprocs/formatInterval');
var formatIntervalShort = require('./sprocs/formatIntervalShort');
var intervalHistThresholds = require('./sprocs/intervalHistThresholds');

var enum_mode = fs.readFileSync('./models/enum_mode.sql', 'utf8');
var enum_role = fs.readFileSync('./models/enum_role.sql', 'utf8');
var accesses = fs.readFileSync('./models/accesses.sql', 'utf8');
var questionViews = fs.readFileSync('./models/questionViews.sql', 'utf8');
var accessRules = fs.readFileSync('./models/access_rules.sql', 'utf8');
var enrollments = fs.readFileSync('./models/enrollments.sql', 'utf8');

var checkAccessRule = fs.readFileSync('./sprocs/check_access_rule.sql', 'utf8');
var checkTestAccess = fs.readFileSync('./sprocs/check_test_access.sql', 'utf8');
var testInstanceDurations = fs.readFileSync('./sprocs/test_instance_durations.sql', 'utf8');
var userTestDurations = fs.readFileSync('./sprocs/user_test_durations.sql', 'utf8');
var testDurationStats = fs.readFileSync('./sprocs/test_duration_stats.sql', 'utf8');
var userTestScores = fs.readFileSync('./sprocs/user_test_scores.sql', 'utf8');
var studentTestScores = fs.readFileSync('./sprocs/student_test_scores.sql', 'utf8');
var testStats = fs.readFileSync('./sprocs/test_stats.sql', 'utf8');

module.exports = {
    init: function(callback) {
        Promise.try(function() {
            return models.sequelize.sync();
        }).then(function() {
            return models.sequelize.query(enum_mode);
        }).then(function() {
            return models.sequelize.query(enum_role);
        }).then(function() {
            return models.sequelize.query(accesses);
        }).then(function() {
            return models.sequelize.query(questionViews);
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
            return models.sequelize.query(accessRules);
        }).then(function() {
            return models.sequelize.query(enrollments);
        }).then(function() {
            return models.sequelize.query(checkAccessRule);
        }).then(function() {
            return models.sequelize.query(checkTestAccess);
        }).then(function() {
            return models.sequelize.query(testInstanceDurations);
        }).then(function() {
            return models.sequelize.query(userTestDurations);
        }).then(function() {
            return models.sequelize.query(testDurationStats);
        }).then(function() {
            return models.sequelize.query(userTestScores);
        }).then(function() {
            return models.sequelize.query(studentTestScores);
        }).then(function() {
            return models.sequelize.query(testStats);
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
