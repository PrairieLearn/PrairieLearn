require('should');
var Promise = require('bluebird');
var pg = require('pg');
var initConString = 'postgres://localhost/postgres';
var testDB = 'pltestdb';
var config = require('../config');
config.sdbAddress = 'postgres://localhost/pltestdb';
var sqldb = require('../sqldb');
var models = require('../models');
var syncSemesters = require('../sync/fromDisk/semesters');

describe('sync to SQL', function() {

    before('create test DB: ' + testDB, function(done) {
        var client = new pg.Client(initConString);
        client.connect(function(err) {
            if (err) return done(err);
            client.query('DROP DATABASE IF EXISTS ' + testDB + ';', function(err, result) {
                if (err) return done(err);
                client.query('CREATE DATABASE ' + testDB + ';', function(err, result) {
                    if (err) return done(err);
                    client.end();
                    sqldb.init(function(err) {
                        if (err) return done(err);
                        done();
                    });
                });
            });
        });
    });

    after('drop test DB: ' + testDB, function(done) {
        models.sequelize.close();
        var client = new pg.Client(initConString);
        client.connect(function(err) {
            if (err) return done(err);
            client.query('DROP DATABASE IF EXISTS ' + testDB + ';', function(err, result) {
                if (err) return done(err);
                done();
            });
        });
    });

    describe('fromDisk/semesters', function() {

        before('load semesters into DB', function() {
            return syncSemesters.sync();
        });

        it('should have exactly 3 semesters', function() {
            var sql = 'SELECT * FROM semesters;';
            models.sequelize.query(sql).should.finally.have.property('0').with.length(3);
        });

        it('should have semesters: Sp15, Fa15, Sp16', function() {
            var sql = 'SELECT * FROM semesters;';
            models.sequelize.query(sql).should.finally.have.property('0').which.containDeep([
                {short_name: 'Sp15'}, // jscs:ignore
                {short_name: 'Fa15'}, // jscs:ignore
                {short_name: 'Sp16'}, // jscs:ignore
            ]);
        });
    });
});
