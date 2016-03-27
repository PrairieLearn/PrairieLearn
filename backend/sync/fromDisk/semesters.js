var _ = require('underscore');
var moment = require('moment-timezone');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');

module.exports = {
    sync: function() {
        return Promise.try(function() {
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
        });
    },
};
