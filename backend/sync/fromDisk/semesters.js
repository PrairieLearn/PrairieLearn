var _ = require('underscore');
var moment = require('moment-timezone');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');

module.exports = {
    sync: function() {
        return Promise.all(_(config.semesters).map(function(semester) {
            return models.Semester.upsert(semester);
        }));
    },
};
