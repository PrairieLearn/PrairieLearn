var _ = require('underscore');
var async = require("async");

var config = require('./config');
var logger = require('./logger');
var moment = require("moment-timezone");

var pg = require('pg');

module.exports = {
    init: function(callback) {
        pg.connect(config.sdbAddress, function(err, client, done) {
            if(err) return callback('error fetching client from pool', err);
            async.series([
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'DROP TABLE semesters CASCADE;'
                    client.query(sql, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, err: err});
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'CREATE TABLE semesters ('
                        + ' id            SERIAL PRIMARY KEY,'
                        + ' short_name    VARCHAR(10),'
                        + ' long_name     VARCHAR(100),'
                        + ' start_date    TIMESTAMP WITH TIME ZONE,'
                        + ' end_date      TIMESTAMP WITH TIME ZONE'
                        + ' );'
                    client.query(sql, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, err: err});
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'INSERT INTO semesters'
                        + ' (short_name, long_name, start_date, end_date)'
                        + ' VALUES ($1, $2, $3, $4)'
                        + ';'
                    var data = ['Sp16', 'Spring 2016',
                                moment.tz('2016-01-19T00:00:01', config.timezone).format(),
                                moment.tz('2016-05-13T23:59:59', config.timezone).format(),
                               ];
                    client.query(sql, data, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, data: data, err: err});
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
            ], function(err, data) {
                done();
                if (err) return callback(err, data);
                callback(null);
            });
        });
    },

    initCourseInfo: function(courseInfo, callback) {
        pg.connect(config.sdbAddress, function(err, client, done) {
            if(err) return callback('error fetching client from pool', err);
            var course_id, semester_id;
            async.series([
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'DROP TABLE courses CASCADE;'
                    client.query(sql, function(err, result) {
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'CREATE TABLE courses ('
                        + ' id              SERIAL PRIMARY KEY,'
                        + ' short_name      VARCHAR(20),'
                        + ' title           VARCHAR(100)'
                        + ' );'
                    client.query(sql, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, err: err});
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'INSERT INTO courses'
                        + ' (short_name, title)'
                        + ' VALUES ($1, $2)'
                        + ';'
                    var data = [courseInfo.name, courseInfo.title];
                    client.query(sql, data, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, data: data, err: err});
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'DROP TABLE course_instances CASCADE;'
                    client.query(sql, function(err, result) {
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'CREATE TABLE course_instances ('
                        + ' id              SERIAL PRIMARY KEY,'
                        + ' course_id       INTEGER REFERENCES courses(id),'
                        + ' semester_id     INTEGER REFERENCES semesters(id)'
                        + ' );'
                    client.query(sql, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, err: err});
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'SELECT id FROM courses WHERE'
                        + ' short_name = $1;'
                    var data = [courseInfo.name];
                    client.query(sql, data, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, data: data, err: err});
                        if (result.rows.length != 1) return callback('invalid number of rows: ' + result.rows.length);
                        course_id = result.rows[0].id;
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'SELECT id FROM semesters WHERE'
                        + ' short_name = $1;'
                    var data = [config.semester];
                    client.query(sql, data, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, data: data, err: err});
                        if (result.rows.length != 1) return callback('invalid number of rows: ' + result.rows.length);
                        semester_id = result.rows[0].id;
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
                function(callback) {
                    var sql = 'INSERT INTO course_instances'
                        + ' (course_id, semester_id)'
                        + ' VALUES ($1, $2)'
                        + ' RETURNING id'
                        + ';'
                    var data = [course_id, semester_id];
                    client.query(sql, data, function(err, result) {
                        if (err) return callback('error running query', {sql: sql, data: data, err: err});
                        if (result.rows.length != 1) return callback('invalid number of rows: ' + result.rows.length);
                        courseInfo.courseInstanceID = result.rows[0].id;
                        callback(null);
                    });
                },
                //////////////////////////////////////////////////////////////////////
            ], function(err, data) {
                done();
                if (err) return callback(err, data);
                callback(null);
            });
        });
    },
};
