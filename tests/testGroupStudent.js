const ERR = require('async-stacktrace');

const config = require('../lib/config');
const path = require('path');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');



var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');

// cd /PrairieLearn
// docker/start_postgres.sh
// git config --global user.email "dev@illinois.edu"
// git config --global user.name "Dev User"
// npm test -- --grep "Group based homework setup on student side"

let res, page, elemList, user;
const locals = {};
locals.helperClient = require('./helperClient');
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';
locals.courseDir = path.join(__dirname, '..', 'exampleCourse');

const storedConfig = {};

describe('Group based homework setup on student side', function() {
    this.timeout(20000);
    before('set authenticated user', function(callback) {
        storedConfig.authUid = config.authUid;
        storedConfig.authName = config.authName;
        storedConfig.authUin = config.authUin;
        callback(null);
    });
    before('set up testing server', helperServer.before(locals.courseDir));
    after('shut down testing server', helperServer.after);
    after('unset authenticated user', function(callback) {
        Object.assign(config, storedConfig);
        callback(null);
    });

    describe('1. the database', function() {   
        it('should contain a group-based homework assessment', function(callback) {
            sqldb.queryOneRow(sql.select_groupwork_assessment, [], function(err, result) {
                if (ERR(err, callback)) return;
                assert.lengthOf(result.rows, 1);
                assert.notEqual(result.rows[0].id, undefined);
                locals.assessment_id = result.rows[0].id;
                locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
                locals.instructorAssessmentsUrlGroupTab = locals.courseInstanceUrl + '/instructor/assessment/' + result.rows[0].id + '/groups';
                callback(null);
            });
        });
    });
    
    describe('2. GET to instructor assessments URL group tab', function() {
        it('should load successfully', function(callback) {
            request(locals.instructorAssessmentsUrlGroupTab, function(error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            });
        });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
        it('should contain "Homework 3: Groups":', function() {
            elemList = locals.$('div.card-header:contains("Homework 3: Groups")');
            assert.lengthOf(elemList, 1);
        });
        it('should have a CSRF token', function() {
            elemList = locals.$('form input[name="__csrf_token"]');
            assert.lengthOf(elemList, 6);
            // there are 6 occurances of the same csrf, we will pick the first one
            assert.nestedProperty(elemList[0], 'attribs.value');
            locals.__csrf_token = elemList[0].attribs.value;
            assert.isString(locals.__csrf_token);
        });
    });

    describe('3. POST to instructor assessments URL to set MIN/MAX for group', function() {
        it('should load successfully', function(callback) {
            var form = {
                __action: 'configGroup',
                __csrf_token: locals.__csrf_token,
                minsize: "3",
                maxsize: "3",
            };
            locals.preStartTime = Date.now();
            request.post({url: locals.instructorAssessmentsUrlGroupTab, form: form, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            });
        });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
        it('should create the correct group configuration', function(callback) {
            var params = {
                assessment_id: locals.assessment_id,
            };
            sqldb.queryOneRow(sql.select_group_config, params, function(err, result) {
                if (ERR(err, callback)) return;
                var min = result.rows[0]["minimum"];
                var max = result.rows[0]["maximum"];
                assert.equal(min, 3);
                assert.equal(max, 3);
            });
            callback(null);
        })
    });

    describe('4. get 3 student user', function() {
        it("should insert/get 3 users into/from the DB", function(callback) {
            sqldb.query(sql.generate_and_enroll_3_users, [], function(err, result) {
                if (ERR(err, callback)) return;
                locals.studentUsers = result.rows.slice(0, 3);
                locals.groupCreator = locals.studentUsers[0];
                assert.lengthOf(locals.studentUsers, 3);
                callback(null);
            });
        });
        it("should be able to switch user", function(callback) {
            config.authUid = locals.groupCreator.uid;
            config.authName = locals.groupCreator.name;
            config.authUin = '00000001';
            callback(null);
        });
    });

    describe('5. POST to assessment page to create group', function() {
        it("should load assessment page successfully", function(callback) {
            request(locals.assessmentUrl, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode, {response, body}));
                    //return callback(new Error(locals.assessmentUrl));
                }
                page = body;
                callback(null);
            });
        });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
        it('should have a CSRF token', function() {
            elemList = locals.$('form input[name="__csrf_token"]');
            assert.lengthOf(elemList, 2);
            assert.nestedProperty(elemList[0], 'attribs.value');
            locals.__csrf_token = elemList[0].attribs.value;
            assert.isString(locals.__csrf_token);
        });
        it("should be able to create a group", function(callback) {
            locals.team_name = "Team BB";
            var form = {
                __action: "createGroup",
                __csrf_token: locals.__csrf_token,
                groupName: locals.team_name,
            };
            request.post({url: locals.assessmentUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            });
        });
        // it('should have 1 students in group 1 in db', function(callback) {
        //     sqldb.query(sql.select_all_user_in_group, [], function(err, result) {
        //         if (ERR(err, callback)) return;
        //         assert.lengthOf(result.rows, 1);
        //         callback(null);
        //     });
        // });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
    });

    describe('6. the group information after 1 user join the group', function() {
        it('should contain the correct team name', function() {
            elemList = locals.$('#group-name');
            assert.equal(elemList.text(), locals.team_name);
        });
        it('should contain the 4-character friend code', function() {
            elemList = locals.$('#friend-code');
            locals.friendCode = elemList.text();
            assert.lengthOf(locals.friendCode, 4);
        });
        it('should not be able to start assessment', function() {
            elemList = locals.$('#start-assessment');
            assert.isTrue(elemList.is(':disabled'));
        });
        it('should be missing 2 more group members to start', function() {
            elemList = locals.$(".text-center:contains(2 more)");
            assert.lengthOf(elemList, 1);
        });
    });

    describe('7. the second user can join the group using code', function() {
        it("should be able to switch user", function(callback) {
            var student = locals.studentUsers[1];
            config.authUid = student.uid;
            config.authName = student.name;
            config.authUin = '00000002';
            callback(null);
        });
        it("should load assessment page successfully", function(callback) {
            request(locals.assessmentUrl, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode, {response, body}));
                    //return callback(new Error(locals.assessmentUrl));
                }
                page = body;
                callback(null);
            });
        });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
        it('should have a CSRF token', function() {
            elemList = locals.$('form input[name="__csrf_token"]');
            assert.lengthOf(elemList, 2);
            assert.nestedProperty(elemList[0], 'attribs.value');
            locals.__csrf_token = elemList[0].attribs.value;
            assert.isString(locals.__csrf_token);
        });
        it('should be able to join group', function(callback) {
            var form = {
                __action: "joinGroup",
                __csrf_token: locals.__csrf_token,
                friendcode: locals.friendCode,
            };
            request.post({url: locals.assessmentUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            });
        });
        // it('should have 2 students in group 1 in db', function(callback) {
        //     sqldb.query(sql.select_all_user_in_group, [], function(err, result) {
        //         if (ERR(err, callback)) return;
        //         assert.lengthOf(result.rows, 2);
        //         callback(null);
        //     });
        // });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });     
    });

    describe('8. the group information after 2 users join the group', function() {
        it('should contain the correct team name', function() {
            elemList = locals.$('#group-name');
            assert.equal(elemList.text(), locals.team_name);
        });
        it('should contain the 4-character friend code', function() {
            elemList = locals.$('#friend-code');
            assert.equal(locals.friendCode, elemList.text());
        });
        it('should not be able to start assessment', function() {
            elemList = locals.$('#start-assessment');
            assert.isTrue(elemList.is(':disabled'));
        });
        it('should be missing 1 more group members to start', function() {
            elemList = locals.$(".text-center:contains(1 more)");
            assert.lengthOf(elemList, 1);
        });
    });

    describe('9. the third user can join the group using code', function() {
        it("should be able to switch user", function(callback) {
            var student = locals.studentUsers[2];
            config.authUid = student.uid;
            config.authName = student.name;
            config.authUin = '00000003';
            callback(null);
        });
        it("should load assessment page successfully", function(callback) {
            request(locals.assessmentUrl, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode, {response, body}));
                    //return callback(new Error(locals.assessmentUrl));
                }
                page = body;
                callback(null);
            });
        });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
        it('should have a CSRF token', function() {
            elemList = locals.$('form input[name="__csrf_token"]');
            assert.lengthOf(elemList, 2);
            assert.nestedProperty(elemList[0], 'attribs.value');
            locals.__csrf_token = elemList[0].attribs.value;
            assert.isString(locals.__csrf_token);
        });
        it('should be able to join group', function(callback) {
            var form = {
                __action: "joinGroup",
                __csrf_token: locals.__csrf_token,
                friendcode: locals.friendCode,
            };
            request.post({url: locals.assessmentUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                res = response;
                page = body;
                callback(null);
            });
        });
        it('should have 3 students in group 1 in db', function(callback) {
            sqldb.query(sql.select_all_user_in_group, [], function(err, result) {
                if (ERR(err, callback)) return;
                assert.lengthOf(result.rows, 3);
                callback(null);
            });
        });
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
    });

    describe('10. the group information after 3 users join the group', function() {
        it('should contain the correct team name', function() {
            elemList = locals.$('#group-name');
            assert.equal(elemList.text(), locals.team_name);
        });
        it('should contain the 4-character friend code', function() {
            elemList = locals.$('#friend-code');
            assert.equal(locals.friendCode, elemList.text());
        });
    });

    describe('11. start assessment', function() {
        it('should have a CSRF token', function() {
            elemList = locals.$('form input[name="__csrf_token"]');
            assert.lengthOf(elemList, 2);
            assert.nestedProperty(elemList[1], 'attribs.value');
            locals.__csrf_token = elemList[1].attribs.value;
            assert.isString(locals.__csrf_token);
        });

        it('should have a non-disabled "start assessment" button', function() {
            elemList = locals.$('#start-assessment');
            assert.isNotTrue(elemList.is(':disabled'));
        });
        it('should have three rows under group members list', function() {
            elemList = locals.$('.col-sm li');
            assert.lengthOf(elemList, 3);
        });
        it('should have 0 assessment instance in db', function(callback) {
            sqldb.query(sql.select_all_assessment_instance, [], function(err, result) {
                if (ERR(err, callback)) return;
                assert.lengthOf(result.rows, 0);
                callback(null);
            });
        });
        it('should be able to start the assessment', function(callback) {
            var form = {
                __action: "newInstance",
                __csrf_token: locals.__csrf_token,
            };
            request.post({url: locals.assessmentUrl, form: form, followAllRedirects: true}, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode));
                    //return callback(new Error(body));
                }
                res = response;
                page = body;
                callback(null);
            });
        });
        it('should have 1 assessment instance in db', function(callback) {
            sqldb.query(sql.select_all_assessment_instance, [], function(err, result) {
                if (ERR(err, callback)) return;
                assert.lengthOf(result.rows, 1);
                locals.assessment_instance_id = result.rows[0].assessment_id;
                // callback(result.rows[0].auth_user_id);
                callback(null);
            });
        });
        it('should be able to access the questions', function(callback) {
            request(locals.courseInstanceUrl + "/assessment_instance/" + locals.assessment_instance_id, function (error, response, body) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 200) {
                    return callback(new Error('bad status: ' + response.statusCode, {response, body}));
                    //return callback(new Error(locals.courseInstanceUrl + "/assessment_instance/" + locals.assessment_instance_id));
                }
                page = body;
                callback(null);
            });
        });
        
        it('should parse', function() {
            locals.$ = cheerio.load(page);
        });
    });
});