var _ = require('underscore');
var async = require("async");

var config = require('./config');
var logger = require('./logger');

var pg = require('pg');

module.exports = {
    init: function(callback) {
        pg.connect(config.sdbAddress, function(err, client, done) {
            if(err) return callback('error fetching client from pool', err);
            client.query('SELECT $1::int AS number', ['1'], function(err, result) {
                done();
                if (err) return callback('error running query', err);
                console.log(result.rows[0].number);
                callback(null);
            });
        });
    },
};

var sql = 'CREATE TABLE submissions ('
    + ' sid varchar(10)'
    + ' qiid varchar(10)'
    + ' uid varchar(10)'
    + ' authUID varchar(10)'
    + ' date varchar(25)'
    + ' submittedAnswer';
