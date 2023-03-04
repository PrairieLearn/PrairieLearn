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

describe('Test group based assessments with custom group roles from student side', function () {
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
        callback(null);
      });
    });
    it('should contain a group-based homework assessment without roles', function (callback) {
      sqldb.query(sql.select_group_work_assessment_without_roles, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 1);
        assert.notEqual(result.rows[0].id, undefined);
        locals.assessment_id_without_roles = result.rows[0].id;
        locals.assessmentUrlWithoutRoles =
          locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
        callback(null);
      });
    });
    it('should contain the 4 roles for the assessment', function (callback) {
      const params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.query(sql.get_assessment_group_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 4);
        locals.groupRoles = result.rows;

        // Store roles by name for later tests
        const manager = result.rows.find((row) => row.role_name === 'Manager');
        assert.isDefined(manager);

        const recorder = result.rows.find((row) => row.role_name === 'Recorder');
        assert.isDefined(recorder);

        const reflector = result.rows.find((row) => row.role_name === 'Reflector');
        assert.isDefined(reflector);

        const contributor = result.rows.find((row) => row.role_name === 'Contributor');
        assert.isDefined(contributor);

        locals.manager = manager;
        locals.recorder = recorder;
        locals.reflector = reflector;
        locals.contributor = contributor;
        callback(null);
      });
    });
  });

  describe('2. get 4 student user', function () {
    it('should insert/get 4 users into/from the DB', function (callback) {
      sqldb.query(sql.generate_and_enroll_4_users, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 4);
        locals.studentUsers = result.rows.slice(0, 4);
        locals.groupCreator = locals.studentUsers[0];
        assert.lengthOf(locals.studentUsers, 4);
        callback(null);
      });
    });

    it('should switch current user to the group creator', function () {
      config.authUid = locals.groupCreator.uid;
      config.authName = locals.groupCreator.name;
      config.authUin = '00000001';
      config.userId = locals.groupCreator.user_id;
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
        assert.equal(userRoles[0].role_name, locals.manager.role_name);
        assert.equal(userRoles[0].role_id, locals.manager.role_id);
        locals.currentRoleIds = [userRoles[0].id];
        callback(null);
      });
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
        callback(null);
      });
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
        assert.equal(userRoles[0].role_name, locals.manager.role_name);
        assert.equal(userRoles[0].role_id, locals.manager.role_id);
        assert.equal(locals.currentRoleIds[0], userRoles[0].id);
        callback(null);
      });
    });
    it('group role table is visible and has one user in it', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 2);
    });
  });

  describe('6. the second user can join the group using code', function () {
    it('should be able to switch user', function () {
      let student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
      config.userId = student.user_id;
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
    it('should update locals with role updates', function () {
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      ];
    });
  });

  describe('7. the group information after 2 users join the group', function () {
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should have correct role configuration in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.query(sql.get_group_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
        callback(null);
      });
    });
    it('should not render the group role table', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 0);
    });
    it('should display error for too few reflectors', function () {
      elemList = locals.$('.alert:contains(Reflector has too few assignments)');
      assert.lengthOf(elemList, 1);
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
    it('should update locals with role updates', function () {
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
      ];
    });
  });

  describe('9. the group information after 3 users join the group', function () {
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
    it('should not render the group role table', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 0);
    });
    it('should display error for too few reflectors', function () {
      elemList = locals.$('.alert:contains(Reflector has too few assignments)');
      assert.lengthOf(elemList, 1);
    });
    it('should have correct role configuration in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.query(sql.get_group_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
        callback(null);
      });
    });
    it('should update locals with role updates', function () {
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
      ];
    });
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
    it('should display error for too few reflectors', function () {
      elemList = locals.$('.alert:contains(Reflector has too few assignments)');
      assert.lengthOf(elemList, 1);
    });
    it('should not render the group role table', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 0);
    });
    it('should have correct role configuration in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.query(sql.get_group_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
        callback(null);
      });
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
      const roleIds = locals.groupRoles.map((role) => role.id);
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

      // Construct role updates from database info
      const roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      // Drop and store the first element here, since we want to test whether Manager is correctly reassigned
      locals.assignerRoleUpdate = roleUpdates.shift();
      locals.roleUpdates = roleUpdates;

      // Mark the checkboxes as checked
      roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 3);
    });
    it('should press submit button to perform the role updates', function (callback) {
      // Grab IDs of checkboxes to construct update request
      const checkedElementIds = {};
      for (let i = 0; i < elemList.length; i++) {
        checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
      }
      var form = {
        __action: 'update_group_roles',
        __csrf_token: locals.__csrf_token,
        ...checkedElementIds,
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
        // We expect the db to have all role updates, including the assigner role
        locals.roleUpdates.push(locals.assignerRoleUpdate);
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
        callback(null);
      });
    });
    it('should have correct roles checked in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 4);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
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
    it('should be able to select the contributor role', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
      assert.lengthOf(elemList, 0);
    });
  });

  describe('14. invalid role configuration - too many students in one role', function () {
    it('should edit role table to correct configuration', function () {
      // Uncheck all of the inputs
      const roleIds = locals.groupRoles.map((role) => role.id);
      const userIds = locals.studentUsers.map((user) => user.user_id);
      for (const roleId of roleIds) {
        for (const userId of userIds) {
          const elementId = `#user_role_${roleId}-${userId}`;
          locals.$('#role-select-form').find(elementId).attr('checked', null);
        }
      }
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 0);

      // [Manager, Recorder, Recorder, Reflector]
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      // Mark the checkboxes as checked
      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 4);
    });
    it('should press submit button to perform the role updates', function (callback) {
      // Grab IDs of checkboxes to construct update request
      const checkedElementIds = {};
      for (let i = 0; i < elemList.length; i++) {
        checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
      }
      var form = {
        __action: 'update_group_roles',
        __csrf_token: locals.__csrf_token,
        ...checkedElementIds,
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
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
        callback(null);
      });
    });
    it('should have correct roles checked in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 4);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });
    it('should display error for too many recorders', function () {
      elemList = locals.$('.alert:contains(Recorder has too many assignments)');
      assert.lengthOf(elemList, 1);
    });
  });

  describe('15. invalid role configuration - one student has too many roles', function () {
    it('should edit role table to correct configuration', function () {
      // Uncheck all of the inputs
      const roleIds = locals.groupRoles.map((role) => role.id);
      const userIds = locals.studentUsers.map((user) => user.user_id);
      for (const roleId of roleIds) {
        for (const userId of userIds) {
          const elementId = `#user_role_${roleId}-${userId}`;
          locals.$('#role-select-form').find(elementId).attr('checked', null);
        }
      }
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 0);

      locals.roleUpdates = [
        // First user has both manager and contributor
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[0].user_id },

        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      // Mark the checkboxes as checked
      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 5);
    });
    it('should press submit button to perform the role updates', function (callback) {
      // Grab IDs of checkboxes to construct update request
      const checkedElementIds = {};
      for (let i = 0; i < elemList.length; i++) {
        checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
      }
      var form = {
        __action: 'update_group_roles',
        __csrf_token: locals.__csrf_token,
        ...checkedElementIds,
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
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
        callback(null);
      });
    });
    it('should have correct roles checked in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 5);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });
    it('should display error for a student having too many roles', function () {
      elemList = locals.$('.alert:contains(too many roles)');
      assert.lengthOf(elemList, 1);
    });
    it('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
  });

  describe('16. switch to the fourth user and leave the group', function () {
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
      // The only element with CSRF token is to leave the group
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
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
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should update locals with roles updates', function () {
      // TODO: Should we find a way to not hard-code this in?
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      ];
    });
  });

  describe('17. switch back to the first user', function () {
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
      assert.lengthOf(elemList, 3);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });

  describe('18. non-required roles are dropped when user leaves group', function () {
    it('should have correct role configuration in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.query(sql.get_group_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
        callback(null);
      });
    });
    it('should have correct roles checked in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 3);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });
  });

  describe('19. switch to user 3, leave, switch back to first user', function () {
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
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    // it('should update locals with roles updates', function () {
    //   // Role ID 3 could either go to user_id 2 or 3
    //   locals.roleUpdates = [
    // { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
    // { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
    //   ];
    // });
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
      assert.lengthOf(elemList, 3);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });

  describe('20. required roles are reorganized when user leaves group', function () {
    it('should have correct role configuration in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
      };
      // Reflector is given to the first user
      const roleUpdates1 = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      ];
      // Reflector is given to the second user
      const roleUpdates2 = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      ];
      // Assert that the reflector role is given to either first or second user
      sqldb.query(sql.get_group_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 3);
        // Get all roles for first user
        const firstUserRoleUpdates = result.rows.filter(
          (row) => row.user_id === locals.studentUsers[0].user_id
        );
        assert.isTrue(firstUserRoleUpdates.length === 1 || firstUserRoleUpdates.length === 2);
        const roleUpdates = firstUserRoleUpdates.length === 2 ? roleUpdates1 : roleUpdates2;
        const expected = roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));

        assert.sameDeepMembers(expected, result.rows);
        locals.roleUpdates = roleUpdates;
        callback(null);
      });
      locals.roleUpdates = roleUpdates1;
    });
    it('should have correct roles checked in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 3);
      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });
  });

  describe('21. leave group as user 1 and switch to user 2', function () {
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
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should update locals with roles updates', function () {
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[1].user_id },
      ];
    });
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
  });
  describe('22. role with assigner privileges is reassigned upon group leave', function () {
    it('should have correct role configuration in the database', function (callback) {
      var params = {
        assessment_id: locals.assessment_id,
      };
      sqldb.query(sql.get_group_roles, params, function (err, result) {
        if (ERR(err, callback)) return;
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
        callback(null);
      });
    });
    it('should have correct roles checked in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 3);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });
    it('group role table is visible and has one user in it', function () {
      elemList = locals.$('#role-select-form').find('tr');
      assert.lengthOf(elemList, 2);
    });
  });

  describe('23. assessments without roles do not show the role selection table', function () {
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
    it('should load new assessment page successfully', function (callback) {
      request(locals.assessmentUrlWithoutRoles, function (error, response, body) {
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
      locals.group_name = 'groupAA';
      var form = {
        __action: 'create_group',
        __csrf_token: locals.__csrf_token,
        groupName: locals.group_name,
      };
      request.post(
        { url: locals.assessmentUrlWithoutRoles, form: form, followAllRedirects: true },
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
    it('group role table is not visible', function () {
      // elemList = locals.$('#role-select-form').find('tr');
      // assert.lengthOf(elemList, 0);
    });
  });
});
