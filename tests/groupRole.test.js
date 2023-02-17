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
        locals.studentUsers = result.rows.slice(0, 4);
        // locals.studentUserNotGrouped = result.rows[3];
        // locals.studentUserInDiffGroup = result.rows[4];
        locals.groupCreator = locals.studentUsers[0];
        assert.lengthOf(locals.studentUsers, 4);

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
    it('should contain the 4-character join code', function () {
      elemList = locals.$('#join-code');
      locals.joinCode = elemList.text();
      assert.lengthOf(locals.joinCode, locals.$('#group-name').text().length + 1 + 4);
    });
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
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input');
      assert.lengthOf(elemList, 4);
    });
    it('should have only manager role checked in the role table', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:checked');
      assert.lengthOf(elemList, 1);

      elemList = elemList.next();
      assert.equal(elemList.text().trim(), 'Manager');
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
    // FIXME: (Cale) I don't know if we necessarily need this test here
    it('should be missing 1 more group members to start', function () {
      elemList = locals.$('.text-center:contains(1 more)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('5. the group information after 1 user leaves and rejoins the group', function () {
    it('should be able to leave the group', function (callback) {
      var form = {
        __action: 'leave_group',
        __csrf_token: locals.__csrf_token,
      };
      request.post(
        {
          url: locals.assessmentUrl,
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
    it('should not have a role for user 1', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
        user_id: config.userId,
      };
      sqldb.query(sql.get_current_user_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        let userRoles = result.rows;
        assert.lengthOf(userRoles, 0);
      });
      callback(null);
    });
    it('should be able to join group', function (callback) {
      var form = {
        __action: 'join_group',
        __csrf_token: locals.__csrf_token,
        join_code: locals.joinCode,
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
    // The tests below copy the previous test section
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
        assert.equal(locals.currentRoleIds[0], userRoles[0].id);
      });
      callback(null);
    });
    it('group role table is visible and has one user in it', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 2);
    });
    // TODO: I don't think we need to re-include all of these
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

  describe('6. the second user can join the group using code', function () {
    it('should be able to switch user', function (callback) {
      let student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
      config.userId = student.user_id;
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
        join_code: locals.joinCode,
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

  describe('7. the group information after 2 users join the group', function () {
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should have user set to recorder role in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
        user_id: config.userId,
      };
      sqldb.query(sql.get_current_user_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        let userRoles = result.rows;
        assert.lengthOf(userRoles, 1);
        assert.equal(userRoles[0].role_name, 'Recorder');
        locals.currentRoleIds = [userRoles[0].role_id];
      });
      callback(null);
    });
    it('group role table is invisible', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 0);
    });
    it('should display error for too few reflectors', function () {
      // FIXME: (Renzo) I'm of the opinion that even if a user has a non-assigner role, they
      // should still be able to view these errors. I'll let the tests pass for now, but we should talk about it.
      elemList = locals.$('.alert:contains(Reflector has too few assignments)');
      assert.lengthOf(elemList, 0);
    });
  });

  describe('8. the third user can join group using code', function () {
    it('should be able to switch user', function (callback) {
      let student = locals.studentUsers[2];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000003';
      config.userId = student.user_id;
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
        join_code: locals.joinCode,
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

  describe('9. the group information after 3 users join the group', function () {
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('group role table is invisible', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 0);
    });
    it('should have user set to recorder role in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
        user_id: config.userId,
      };
      sqldb.query(sql.get_current_user_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        let userRoles = result.rows;
        assert.lengthOf(userRoles, 1);
        assert.equal(userRoles[0].role_name, 'Recorder');
        locals.currentRoleIds = [userRoles[0].role_id];
      });
      callback(null);
    });
    // TODO: Should we add a test to confirm that the other two users' roles are still correct?
  });

  describe('10. the fourth user can join group using code', function () {
    it('should be able to switch user', function (callback) {
      let student = locals.studentUsers[3];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000004';
      config.userId = student.user_id;
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
        join_code: locals.joinCode,
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

  describe('11. the group information after 4 users join the group', function () {
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('group role table is invisible', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 0);
    });
    it('should have user set to contributor role in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
        user_id: config.userId,
      };
      sqldb.query(sql.get_current_user_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        let userRoles = result.rows;
        assert.lengthOf(userRoles, 1);
        assert.equal(userRoles[0].role_name, 'Contributor');
        locals.currentRoleIds = [userRoles[0].role_id];
      });
      callback(null);
    });
  });

  describe('12. switch back to the first user', function () {
    it('should be able to switch user', function (callback) {
      let student = locals.studentUsers[0];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000001';
      config.userId = student.user_id;
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
  });

  describe('13. the role assigner can re-assign roles to valid configuration', function () {
    it('group role table is visible and has four users in it', function () {
      elemList = locals.$('#role-select-form').find('tr');
      // Header row and four user rows
      assert.lengthOf(elemList, 5);
    });
    it('should edit role table to correct configuration', function () {
      // Uncheck all of the inputs
      const roleIds = [1, 2, 3, 4];
      const userIds = locals.studentUsers.map((user) => user.user_id);
      for (const roleId of roleIds) {
        for (const userId of userIds) {
          const elementId = `#user_role_${roleId}-${userId}`;
          locals.$('#role-select-form').find(elementId).attr('checked', null);
        }
      }

      // Ensure all checkboxes are unchecked
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 0);

      // Role IDs: 1 = Manager, 2 = Recorder, 3 = Reflector, 4 = Contributor
      // Pattern: user_role_<role_id>-<user_id>
      // TODO: Make sure user IDs match what I'm putting here. Printing it out yields 2, 3, 4, 5
      let roleUpdates = ['user_role_2-2', 'user_role_3-3', 'user_role_4-4'];
      roleUpdates.forEach((update) => {
        locals.$(`#${update}`).attr('checked', '');
      });

      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 3);
    });
    it('should press submit button to perform the role updates', function (callback) {
      var form = {
        __action: 'update_group_roles',
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
    it('should reload assessment page successfully', function (callback) {
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
    it('should have correct role configuration in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.query(sql.get_group_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        let expected = [
          { user_id: '2', group_role_id: '1' },
          { user_id: '3', group_role_id: '2' },
          { user_id: '4', group_role_id: '3' },
          { user_id: '5', group_role_id: '4' },
        ];
        console.log('Actual: ', result.rows);
        console.log('Expected: ', expected);
        assert.deepEqual(expected, result.rows);
      });
      callback(null);
    });
    it('should have correct roles checked in the table', function () {
      let roleUpdates = ['user_role_1-2', 'user_role_2-3', 'user_role_3-4', 'user_role_4-5'];
      roleUpdates.forEach((update) => {
        elemList = locals.$('#role-select-form').find(`#${update}`).find('input:checked');
        assert.lengthOf(elemList, 1);
      });
    });
    it('should have no errors displayed', function () {
      elemList = locals.$('.alert:contains(has too few assignments)');
      assert.lengthOf(elemList, 0);
      elemList = locals.$('.alert:contains(has too many assignments)');
      assert.lengthOf(elemList, 0);
    });
    it('should be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isFalse(elemList.is(':disabled'));
    });
  });

  describe('14. the role assigner cannot re-assign roles past a role maximum', function () {
    // TODO: implement
  });

  describe('15. non-required roles are dropped when user leaves group', function () {
    // TODO: implement
  });

  describe('16. required roles are reorganized when user leaves group', function () {
    // TODO: implement
  });

  describe('17. assessments without roles do not show the role selection table', function () {
    // TODO: implement
  });
});
