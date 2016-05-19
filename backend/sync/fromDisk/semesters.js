var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');

var config = require('../../config');
var sqldb = require('../../sqldb');

module.exports = {
    sync: function(callback) {
        async.eachSeries(config.semesters, function(semester, callback) {
            var sql
                = ' INSERT INTO semesters (short_name, long_name, start_date, end_date)'
                + ' VALUES ($1, $2, $3, $4)'
                + ' ON CONFLICT (short_name) DO UPDATE'
                + ' SET'
                + '     long_name = EXCLUDED.long_name,'
                + '     start_date = EXCLUDED.start_date,'
                + '     end_date = EXCLUDED.end_date'
                + ' ;';
            var params = [semester.shortName, semester.longName, semester.startDate, semester.endDate];
            sqldb.query(sql, params, callback);
        }, callback);
    },
};
