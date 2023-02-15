const ERR = require('async-stacktrace');

const config = require('../lib/config');
const path = require('path');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

var sqldb = require('@prairielearn/postgres');
var sql = sqldb.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');

let page, elemList;
const locals = {};
locals.helperClient = require('./helperClient');
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';
locals.courseDir = path.join(__dirname, '..', 'testCourse');

const storedConfig = {};

// TODO: Figure out a more descriptive title?
describe('Group based homework assess custom group roles from student side', function () {
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
    it('should contain a group-based homework assessment with roles', function (callback) {
      sqldb.query(sql.select_group_work_assessment_with_roles, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 1);
        assert.notEqual(result.rows[0].id, undefined);
        locals.assessment_id = result.rows[0].id;
        locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
        locals.instructorAssessmentsUrlGroupTab =
          locals.courseInstanceUrl + '/instructor/assessment/' + locals.assessment_id + '/groups';
        callback(null);
      });
    });
  });

  describe('2. get 5 student user', function () {
    it('should insert/get 5 users into/from the DB', function (callback) {
      sqldb.query(sql.generate_and_enroll_5_users, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 5);
        locals.studentUsers = result.rows.slice(0, 3);
        // locals.studentUserNotGrouped = result.rows[3];
        // locals.studentUserInDiffGroup = result.rows[4];
        locals.groupCreator = locals.studentUsers[0];
        assert.lengthOf(locals.studentUsers, 3);

        // switch user to the group creator
        config.authUid = locals.groupCreator.uid;
        config.authName = locals.groupCreator.name;
        config.authUin = '00000001';
        config.userId = locals.groupCreator.user_id;
        callback(null);
      });
    });
  });

  describe('3. POST to assessment page to create group', function () {
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

  describe('4. the group information after 1 user join the group', function () {
    it('should have user set to manager role in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
        user_id: config.userId,
      };
      sqldb.query(sql.get_current_user_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        let userRoles = result.rows;
        assert.lengthOf(userRoles, 1);
        assert.equal(userRoles[0].role_name, 'Manager');
        locals.currentRoleIds = [userRoles[0].id];
      });
      callback(null);
    });
    it('group role table is visible and has one user in it', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 2);
    });
    it('should contain four textboxes per table row', function () {
      // gets all <input> elems within the second <tr> (the first is a header)
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input');
      assert.lengthOf(elemList, 4);
    });
    it('should have only manager role checked in the role table', function () {
      // gets all <input> elems that are selected
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:checked');
      assert.lengthOf(elemList, 1);

      elemList = elemList.next(); // look at the <label> just after the <input>
      assert.equal(elemList.text().trim(), 'Manager');
      // NOTE: Should we be looking at the html name/id of the <input>? Or is the label text fine?
      // TODO: Should we explicitly confirm the "Manager" role has assigner privleges? Or is that implied already?
    });
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should display error for too few recorders/reflectors', function () {
      elemList = locals.$('.alert:contains(Recorder has too few assignments)');
      assert.lengthOf(elemList, 1);
      elemList = locals.$('.alert:contains(Reflector has too few assignments)');
      assert.lengthOf(elemList, 1);
    });
    it('should not be able to select the contributor role', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
      assert.lengthOf(elemList, 1);

      // Get label of checkbox
      elemList = elemList.next();
      assert.equal(elemList.text().trim(), 'Contributor');
    });
  });
});
