var _ = require('underscore');
var moment = require('moment-timezone');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');

module.exports = {
    sync: function(callback) {
        logger.infoOverride("Updating semesters in SQL DB");
        Promise.try(function() {
            return models.Semester.upsert({
                shortName: 'Sp15',
                longName: 'Spring 2015',
                startDate: moment.tz('2015-01-20T00:00:01', config.timezone).format(),
                endDate: moment.tz('2015-05-15T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            return models.Semester.upsert({
                shortName: 'Fa15',
                longName: 'Fall 2015',
                startDate: moment.tz('2015-08-24T00:00:01', config.timezone).format(),
                endDate: moment.tz('2015-12-18T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            return models.Semester.upsert({
                shortName: 'Sp16',
                longName: 'Spring 2016',
                startDate: moment.tz('2016-01-19T00:00:01', config.timezone).format(),
                endDate: moment.tz('2016-05-13T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            return models.Semester.upsert({
                shortName: 'Su16',
                longName: 'Summer 2016',
                startDate: moment.tz('2016-06-13T00:00:01', config.timezone).format(),
                endDate: moment.tz('2016-08-06T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
