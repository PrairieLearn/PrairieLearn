var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('assert');
var request = require('request');
var cheerio = require('cheerio');

var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var testHelperServer = require('./testHelperServer');

var siteUrl = 'http://localhost:3000';
var baseUrl = siteUrl + '/pl';
var assessmentsUrl = baseUrl + '/course_instance/1/assessments';
var assessmentUrl, assessmentInstanceUrl, q1Url, q2Url;

describe('Homework assessment', function() {

    before("set up testing server", testHelperServer.before);
    after("shut down testing server", testHelperServer.after);

    var res, page, $, linkList;
    var assessment_id, assessment_instance, instance_questions;

    describe('database', function() {
        it('should contain HW1', function(callback) {
            sqldb.queryOneRow(sql.select_hw1, [], function(err, result) {
                if (ERR(err, callback)) return;
                assessment_id = result.rows[0].id;
                callback(null);
            });
        });
    });

    describe('/pl/assessments', function() {
        it('should load successfully', function(callback) {
            request(assessmentsUrl, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            })
        });
        it('should parse', function() {
            $ = cheerio.load(page);
        });
        it('should contain HW1', function() {
            linkList = $('td a:contains("HW1")');
            assert.ok(linkList.length);
        });
        it('should have the correct link for HW1', function() {
            assessmentUrl = siteUrl + linkList[0].attribs.href;
            assert.equal(assessmentUrl, baseUrl + '/course_instance/1/assessment/' + assessment_id + '/');
        });
    });

    describe('GET to assessment URL', function() {
        it('should load successfully', function(callback) {
            request(assessmentUrl, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            })
        });
        it('should create one assessment_instance', function(callback) {
            sqldb.query(sql.select_assessment_instances, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount != 1) {
                    return callback(new Error('expected one assessment_instance, got: ' + result.rowCount));
                }
                assessment_instance = result.rows[0];
                callback(null);
            });
        });
        it('should have the correct assessment_instance.assessment_id', function() {
            assert.equal(assessment_instance.assessment_id, assessment_id);
        });
        it('should create two instance_questions', function(callback) {
            sqldb.query(sql.select_instance_questions, [], function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount != 2) {
                    return callback(new Error('expected two instance_questions, got: ' + result.rowCount));
                }
                instance_questions = result.rows;
                callback(null);
            });
        });
        it('should have the correct first question', function() {
            assert.equal(instance_questions[0].qid, 'addVectors');
        });
        it('should have the correct second question', function() {
            assert.equal(instance_questions[1].qid, 'fossilFuelsRadio');
        });
    });
});
