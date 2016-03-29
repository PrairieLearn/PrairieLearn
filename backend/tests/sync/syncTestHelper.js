var pg = require('pg');
var initConString = 'postgres://localhost/postgres';
var testDB = 'pltestdb';
var config = require('../../config');
config.sdbAddress = 'postgres://localhost/pltestdb';
var sqldb = require('../../sqldb');
var models = require('../../models');

module.exports = {
    syncSemesters: require('../../sync/fromDisk/semesters'),
    syncCourseInfo: require('../../sync/fromDisk/courseInfo'),
    syncCourseStaff: require('../../sync/fromDisk/courseStaff'),
    syncTopics: require('../../sync/fromDisk/topics'),
    syncQuestions: require('../../sync/fromDisk/questions'),
    syncTestSets: require('../../sync/fromDisk/testSets'),
    syncTests: require('../../sync/fromDisk/tests'),

    before: function(done) {
        var client = new pg.Client(initConString);
        client.connect(function(err) {
            if (err) return done(err);
            client.query('DROP DATABASE IF EXISTS ' + testDB + ';', function(err, result) {
                if (err) return done(err);
                client.query('CREATE DATABASE ' + testDB + ';', function(err, result) {
                    if (err) return done(err);
                    client.end();
                    models.init();
                    sqldb.init(function(err) {
                        if (err) return done(err);
                        done();
                    });
                });
            });
        });
    },

    after: function(done) {
        models.sequelize.close();
        var client = new pg.Client(initConString);
        client.connect(function(err) {
            if (err) return done(err);
            client.query('DROP DATABASE IF EXISTS ' + testDB + ';', function(err, result) {
                if (err) return done(err);
                done();
            });
        });
    },
};
