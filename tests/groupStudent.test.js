const ERR = require('async-stacktrace');

const config = require('../lib/config');
const path = require('path');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

var sqldb = require('../prairielib/lib/sql-db');
var sqlLoader = require('../prairielib/lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');
const { idsEqual } = require('../lib/id');

let page, elemList;
const locals = {};
locals.helperClient = require('./helperClient');
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';
locals.courseDir = path.join(__dirname, '..', 'testCourse');

const storedConfig = {};

describe('Group based homework assess control on student side', function () {
  this.timeout(20000);
  before('set authenticated user', function (callback) {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    callback(null);
  });
  before('set up testing server', helperServer.before(locals.courseDir));
  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function (callback) {
    Object.assign(config, storedConfig);
    callback(null);
  });

  describe('1. the database', function () {
    it('should contain a group-based homework assessment', function (callback) {
      sqldb.query(sql.select_group_work_assessment, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 2);
        assert.notEqual(result.rows[0].id, undefined);
        locals.assessment_id = result.rows[0].id;
        locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
        locals.instructorAssessmentsUrlGroupTab =
          locals.courseInstanceUrl + '/instructor/assessment/' + locals.assessment_id + '/groups';
        locals.assessment_id_2 = idsEqual(result.rows[1].id, locals.assessment_id)
          ? result.rows[0].id
          : result.rows[1].id;
        locals.assessmentUrl_2 = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id_2;
        locals.instructorAssessmentsUrlGroupTab_2 =
          locals.courseInstanceUrl + '/instructor/assessment/' + locals.assessment_id_2 + '/groups';
        callback(null);
      });
    });
  });

  describe('2. GET to instructor assessments URL group tab for the first assessment', function () {
    it('should load successfully', function (callback) {
      request(locals.instructorAssessmentsUrlGroupTab, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 5);
      // there are 6 occurrences of the same csrf, we will pick the first one
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });

  describe('3. Check if the config is correct', function () {
    it('should create the correct group configuration', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.queryOneRow(sql.select_group_config, params, function (err, result) {
        if (ERR(err, callback)) return;
        var min = result.rows[0]['minimum'];
        var max = result.rows[0]['maximum'];
        assert.equal(min, 3);
        assert.equal(max, 3);
      });
      callback(null);
    });
  });

  describe('4. GET to instructor assessments URL group tab for the second assessment', function () {
    it('should load successfully', function (callback) {
      request(locals.instructorAssessmentsUrlGroupTab_2, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 5);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });

  describe('5. Check if the config is correct', function () {
    it('should create the correct group configuration', function (callback) {
      var params = {
        assessment_id: locals.assessment_id_2,
      };
      sqldb.queryOneRow(sql.select_group_config, params, function (err, result) {
        if (ERR(err, callback)) return;
        var min = result.rows[0]['minimum'];
        var max = result.rows[0]['maximum'];
        assert.equal(min, 3);
        assert.equal(max, 3);
      });
      callback(null);
    });
  });

  describe('6. get 5 student user', function () {
    it('should insert/get 5 users into/from the DB', function (callback) {
      sqldb.query(sql.generate_and_enroll_5_users, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 5);
        locals.studentUsers = result.rows.slice(0, 3);
        locals.studentUserNotGrouped = result.rows[3];
        locals.studentUserInDiffGroup = result.rows[4];
        locals.groupCreator = locals.studentUsers[0];
        assert.lengthOf(locals.studentUsers, 3);
        callback(null);
      });
    });
    it('should be able to switch user', function (callback) {
      config.authUid = locals.groupCreator.uid;
      config.authName = locals.groupCreator.name;
      config.authUin = '00000001';
      callback(null);
    });
  });

  describe('7. POST to assessment page to create group', function () {
    it('should load assessment page successfully', function (callback) {
      request(locals.assessmentUrl, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to create a group', function (callback) {
      locals.group_name = 'groupBB';
      var form = {
        __action: 'create_group',
        __csrf_token: locals.__csrf_token,
        groupName: locals.group_name,
      };
      request.post(
        { url: locals.assessmentUrl, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });

  describe('8. the group information after 1 user join the group', function () {
    it('should contain the correct group name', function () {
      elemList = locals.$('#group-name');
      assert.equal(elemList.text(), locals.group_name);
    });
    it('should contain the 4-character join code', function () {
      elemList = locals.$('#join-code');
      locals.join_code = elemList.text();
      assert.lengthOf(locals.join_code, locals.$('#group-name').text().length + 1 + 4);
    });
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should be missing 2 more group members to start', function () {
      elemList = locals.$('.text-center:contains(2 more)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('9. the second user can join the group using code', function () {
    it('should be able to switch user', function (callback) {
      var student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
      callback(null);
    });
    it('should load assessment page successfully', function (callback) {
      request(locals.assessmentUrl, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to join group', function (callback) {
      var form = {
        __action: 'join_group',
        __csrf_token: locals.__csrf_token,
        join_code: locals.join_code,
      };
      request.post(
        { url: locals.assessmentUrl, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });

  describe('10. the group information after 2 users join the group', function () {
    it('should contain the correct group name', function () {
      elemList = locals.$('#group-name');
      assert.equal(elemList.text(), locals.group_name);
    });
    it('should contain the 4-character join code', function () {
      elemList = locals.$('#join-code');
      assert.equal(locals.join_code, elemList.text());
      console.log(elemList.text());
    });
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should be missing 1 more group members to start', function () {
      elemList = locals.$('.text-center:contains(1 more)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('11. the third user can join the group using code', function () {
    it('should be able to switch user', function (callback) {
      var student = locals.studentUsers[2];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000003';
      callback(null);
    });
    it('should load assessment page successfully', function (callback) {
      request(locals.assessmentUrl, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to join group', function (callback) {
      var form = {
        __action: 'join_group',
        __csrf_token: locals.__csrf_token,
        join_code: locals.join_code,
      };
      request.post(
        { url: locals.assessmentUrl, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should have 3 students in group 1 in db', function (callback) {
      sqldb.query(sql.select_all_user_in_group, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 3);
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });

  describe('12. the group information after 3 users join the group', function () {
    it('should contain the correct group name', function () {
      elemList = locals.$('#group-name');
      assert.equal(elemList.text(), locals.group_name);
    });
    it('should contain the 4-character join code', function () {
      elemList = locals.$('#join-code');
      assert.equal(locals.join_code, elemList.text());
    });
  });
  describe('13. the fourth user can not join the already full group', function () {
    it('should be able to switch to the ungrouped student', function (callback) {
      var student = locals.studentUserNotGrouped;
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000004';
      callback(null);
    });
    it('should load assessment page successfully', function (callback) {
      request(locals.assessmentUrl, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should NOT be able to join group', function (callback) {
      var form = {
        __action: 'join_group',
        __csrf_token: locals.__csrf_token,
        join_code: locals.join_code,
      };
      request.post(
        { url: locals.assessmentUrl, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should contain a prompt to inform the user that the group is full', function () {
      elemList = locals.$('.alert:contains(It is already full)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('14. start assessment as the third user', function () {
    it('should be able to switch user', function (callback) {
      var student = locals.studentUsers[2];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000003';
      callback(null);
    });
    it('should load assessment page successfully', function (callback) {
      request(locals.assessmentUrl, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[1], 'attribs.value');
      locals.__csrf_token = elemList[1].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should have a non-disabled "start assessment" button', function () {
      elemList = locals.$('#start-assessment');
      assert.isNotTrue(elemList.is(':disabled'));
    });
    it('should have three rows under group members list', function () {
      elemList = locals.$('.col-sm li');
      assert.lengthOf(elemList, 3);
    });
    it('should have 0 assessment instance in db', function (callback) {
      sqldb.query(sql.select_all_assessment_instance, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 0);
        callback(null);
      });
    });
    it('should be able to start the assessment', function (callback) {
      var form = {
        __action: 'new_instance',
        __csrf_token: locals.__csrf_token,
      };
      request.post(
        { url: locals.assessmentUrl, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should have 1 assessment instance in db', function (callback) {
      sqldb.query(sql.select_all_assessment_instance, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 1);
        locals.assessment_instance_id = result.rows[0].id;
        locals.assessmentInstanceURL =
          locals.courseInstanceUrl + '/assessment_instance/' + locals.assessment_instance_id;
        assert.equal(result.rows[0].group_id, 1);
        callback(null);
      });
    });
  });

  describe('15. access control of all members of group 1', function () {
    it('should be able to access the assessment instance 1 as the 1st group member', function (callback) {
      request(locals.assessmentInstanceURL, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should be able to switch to 2nd group member', function (callback) {
      var student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
      callback(null);
    });
    it('should be able to access the assessment instance 1 as the 2nd group member', function (callback) {
      request(locals.assessmentInstanceURL, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should be able to switch to 3rd group member', function (callback) {
      var student = locals.studentUsers[0];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000001';
      callback(null);
    });
    it('should be able to access the assessment instance 1 as the 3rd group member', function (callback) {
      request(locals.assessmentInstanceURL, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });

  describe('16. access control of student who used to be in group 1 but not in any group now', function () {
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 3);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to Leave the group', function (callback) {
      var form = {
        __action: 'leave_group',
        __csrf_token: locals.__csrf_token,
      };
      request.post(
        {
          url: locals.assessmentInstanceURL,
          form: form,
          followAllRedirects: true,
        },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should NOT be able to access the assessment instance 1 as a ungrouped student', function (callback) {
      request(locals.assessmentInstanceURL, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 403) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
  });
  describe('17. access control of student who used to be in group 1 but in a different group now', function () {
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to create a group', function (callback) {
      locals.group_name_alternative1 = 'groupCC';
      var form = {
        __action: 'create_group',
        __csrf_token: locals.__csrf_token,
        groupName: locals.group_name_alternative1,
      };
      request.post(
        { url: locals.assessmentUrl, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should NOT be able to access the assessment instance 1 as a student from a different group', function (callback) {
      request(locals.assessmentInstanceURL, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 403) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
  });

  describe('18. access control of student who are not in any group', function () {
    it('should be able to switch to the ungrouped student', function (callback) {
      var student = locals.studentUserNotGrouped;
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000004';
      callback(null);
    });
    it('should NOT be able to access the assessment instance 1 as a ungrouped student', function (callback) {
      request(locals.assessmentInstanceURL, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 403) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
  });

  describe('19. access control of student who are in a different group', function () {
    it('should be able to switch to the student in the different group', function (callback) {
      var student = locals.studentUserInDiffGroup;
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000005';
      callback(null);
    });
    it('should load assessment page successfully', function (callback) {
      request(locals.assessmentUrl, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should be able to create a group', function (callback) {
      locals.group_name_alternative2 = 'groupBBCC';
      var form = {
        __action: 'create_group',
        __csrf_token: locals.__csrf_token,
        groupName: locals.group_name_alternative2,
      };
      request.post(
        { url: locals.assessmentUrl, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
    });
    it('should NOT be able to access the assessment instance 1 as a student from a different group', function (callback) {
      request(locals.assessmentInstanceURL, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 403) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
  });

  describe('20. cross assessment grouping', function () {
    it('should contain a second group-based homework assessment', function (callback) {
      sqldb.query(sql.select_group_work_assessment, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 2);
        assert.notEqual(result.rows[1].id, undefined);
        callback(null);
      });
    });
    it('should load the second assessment page successfully', function (callback) {
      request(locals.assessmentUrl_2, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode, { response, body }));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should NOT be able to join group using the join code from a different assessment', function (callback) {
      var form = {
        __action: 'join_group',
        __csrf_token: locals.__csrf_token,
        join_code: locals.join_code,
      };
      request.post(
        { url: locals.assessmentUrl_2, form: form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        }
      );
      it('should contain a prompt to inform the user that the group is full', function () {
        elemList = locals.$('.alert:contains(It is already full)');
        assert.lengthOf(elemList, 1);
      });
    });
  });
});
