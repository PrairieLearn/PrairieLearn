const assert = require('chai').assert;
const cheerio = require('cheerio');
const fetch = require('node-fetch').default;
const fs = require('fs-extra');
const path = require('path');
const { step } = require('mocha-steps');
const tmp = require('tmp-promise');
const util = require('util');

const { config } = require('../lib/config');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
const { syncCourseData } = require('./sync/util');

const helperServer = require('./helperServer');
const { URLSearchParams } = require('url');
const { getGroupRoleReassignmentsAfterLeave } = require('../lib/groups');

let elemList;
const locals = {};
locals.helperClient = require('./helperClient');
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';
locals.courseDir = path.join(__dirname, '..', 'testCourse');

const storedConfig = {};

/**
 * Switches `config` to new user, loads assessment page, and changes local CSRF token
 * @param {Object} studentUser
 * @param {string} assessmentUrl
 * @param {String} authUin
 * @param {Number} numCsrfTokens
 */
const switchUserAndLoadAssessment = async (studentUser, assessmentUrl, authUin, numCsrfTokens) => {
  // Load config
  config.authUid = studentUser.uid;
  config.authName = studentUser.name;
  config.authUin = authUin;
  config.userId = studentUser.user_id;

  // Load assessment
  const res = await fetch(assessmentUrl);
  assert.isOk(res.ok);
  locals.$ = cheerio.load(await res.text());

  // Check for CSRF tokens
  elemList = locals.$('form input[name="__csrf_token"]');
  assert.lengthOf(elemList, numCsrfTokens);
  assert.nestedProperty(elemList[0], 'attribs.value');
  locals.__csrf_token = elemList[0].attribs.value;
  assert.isString(locals.__csrf_token);
};

/**
 * Joins group as current user with CSRF token and loads page with cheerio.
 * @param {String} assessmentUrl
 * @param {String} joinCode
 */
const joinGroup = async (assessmentUrl, joinCode) => {
  const form = {
    __action: 'join_group',
    __csrf_token: locals.__csrf_token,
    join_code: joinCode,
  };
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams(form),
  });
  assert.isOk(res.ok);
  locals.$ = cheerio.load(await res.text());
};

/**
 * Leaves group as current user
 * @param {String} assessmentUrl
 */
const leaveGroup = async (assessmentUrl) => {
  const form = {
    __action: 'leave_group',
    __csrf_token: locals.__csrf_token,
  };
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams(form),
  });
  assert.isOk(res.ok);
};

/**
 * @param {Array} roleAssignments
 * @param {String} assessmentId
 */
const verifyGroupRoleAssignmentsInDatabase = async (roleAssignments, assessmentId) => {
  const expected = roleAssignments.map(({ roleId, groupUserId }) => ({
    user_id: groupUserId,
    group_role_id: roleId,
  }));
  const result = await sqldb.queryAsync(sql.select_group_user_roles, {
    assessment_id: assessmentId,
  });
  assert.sameDeepMembers(result.rows, expected);
};

/**
 * Sends and verifies a group roles update request using current user.
 * Updates element list to check that group role select table is changed correctly.
 * @param {Array} roleUpdates
 * @param {Array} groupRoles
 * @param {Array} studentUsers
 * @param {String} assessmentUrl
 */
const updateGroupRoles = async (roleUpdates, groupRoles, studentUsers, assessmentUrl) => {
  // Uncheck all of the inputs
  const roleIds = groupRoles.map((role) => role.id);
  const userIds = studentUsers.map((user) => user.user_id);
  for (const roleId of roleIds) {
    for (const userId of userIds) {
      const elementId = `#user_role_${roleId}-${userId}`;
      locals.$('#role-select-form').find(elementId).attr('checked', null);
    }
  }

  // Ensure all checkboxes are unchecked
  elemList = locals.$('#role-select-form').find('tr').find('input:checked');
  assert.lengthOf(elemList, 0);

  // Remove role assignments from second user
  roleUpdates = [{ roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id }];

  // Mark the checkboxes as checked
  roleUpdates.forEach(({ roleId, groupUserId }) => {
    locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
  });
  elemList = locals.$('#role-select-form').find('tr').find('input:checked');
  assert.lengthOf(elemList, 1);

  // Grab IDs of checkboxes to construct update request
  const checkedElementIds = {};
  for (let i = 0; i < elemList.length; i++) {
    checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
  }
  const form = {
    __action: 'update_group_roles',
    __csrf_token: locals.__csrf_token,
    ...checkedElementIds,
  };
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams(form),
  });
  assert.isOk(res.ok);
};

describe('Test group based assessments with custom group roles from student side', function () {
  this.timeout(20000);
  before('set authenticated user', function () {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });
  before('set up testing server', helperServer.before(locals.courseDir));
  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function () {
    Object.assign(config, storedConfig);
  });

  step('should contain a group-based homework assessment with roles', async function () {
    const result = await sqldb.queryAsync(sql.select_group_work_assessment_with_roles, []);
    assert.lengthOf(result.rows, 1);
    assert.notEqual(result.rows[0].id, undefined);
    locals.assessment_id = result.rows[0].id;
    locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
  });

  step('should contain a group-based homework assessment without roles', async function () {
    const result = await sqldb.queryAsync(sql.select_group_work_assessment_without_roles, []);
    assert.lengthOf(result.rows, 1);
    assert.notEqual(result.rows[0].id, undefined);
    assert.equal(result.rows[0].has_roles, false);
    locals.assessment_id_without_roles = result.rows[0].id;
    locals.assessmentUrlWithoutRoles =
      locals.courseInstanceUrl + '/assessment/' + locals.assessment_id_without_roles;
  });

  step('should contain the 4 group roles for the assessment', async function () {
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_assessment_group_roles, params);
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
  });

  step('should insert/get 5 users into/from the DB', async function () {
    const result = await sqldb.queryAsync(sql.generate_and_enroll_5_users, []);
    assert.lengthOf(result.rows, 5);
    locals.studentUsers = result.rows;
  });

  step('should be able to create a group as first user', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 2);
    locals.group_name = 'groupBB';
    const form = {
      __action: 'create_group',
      __csrf_token: locals.__csrf_token,
      groupName: locals.group_name,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('group creator should have manager role in database', async function () {
    // Updating local variables to persist role updates across tests
    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
    ];

    // Check role config
    await verifyGroupRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
  });

  step('should contain the 4-character join code', function () {
    elemList = locals.$('#join-code');
    locals.joinCode = elemList.text();
    assert.lengthOf(locals.joinCode, locals.$('#group-name').text().length + 1 + 4);
  });

  step('group role table is visible and has one user in it', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 2);
  });

  step('should contain four textboxes per table row', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input');
    assert.lengthOf(elemList, 4);
  });

  step('should have only manager role checked in the role table', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:checked');
    assert.lengthOf(elemList, 1);

    elemList = elemList.next();
    assert.equal(elemList.text().trim(), locals.manager.role_name);
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should display error for too few recorders/reflectors', function () {
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Reflector.)');
    assert.lengthOf(elemList, 1);
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Recorder.)');
    assert.lengthOf(elemList, 1);
  });

  step('should not be able to select the contributor role', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
    assert.lengthOf(elemList, 1);
    elemList = elemList.next();
    assert.equal(elemList.text().trim(), locals.contributor.role_name);
  });

  step('should be missing 1 more group members to start', function () {
    elemList = locals.$('.text-center:contains(1 more)');
    assert.lengthOf(elemList, 1);
  });

  step('manager should be able to leave the group and reload assessment', async function () {
    await leaveGroup(locals.assessmentUrl);

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
  });

  step('should have no role assignments in the database after leave', async function () {
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    // Since there are no users currently in the group, there must be no role assignments
    assert.lengthOf(result.rows, 0);
  });

  step('first user should be able to join group again', async function () {
    await joinGroup(locals.assessmentUrl, locals.joinCode);
  });

  step('first user should have manager role in database', async function () {
    const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    assert.sameDeepMembers(expected, result.rows);
  });

  step('group role table is visible and has one user in it', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 2);
  });

  step('second user should be able to join group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[1], locals.assessmentUrl, '00000002', 2);
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should have correct role configuration in the database for two users', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
    ];
    const expected = expectedRoleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should not render the group role table for non-assigner', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 0);
  });

  step('should display error for too few reflectors', function () {
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Reflector.)');
    assert.lengthOf(elemList, 1);
  });

  step('should switch back to first user', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 2);
  });

  step('check group role table is visible and has two users in it', async function () {
    elemList = locals.$('#role-select-form').find('tr');
    // Header row and two user rows
    assert.lengthOf(elemList, 3);
  });

  step('should be able to remove role assignments from second user', async function () {
    // Remove role assignments from second user
    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
    ];
    await updateGroupRoles(
      locals.roleUpdates,
      locals.groupRoles,
      locals.studentUsers,
      locals.assessmentUrl
    );
  });

  step('should reload assessment page successfully', async function () {
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have only manager role in the database after reassigning roles', async function () {
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should have only manager for first user selected in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 1);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should have error displayed for requiring all users have a role', function () {
    elemList = locals.$(
      '.alert:contains(At least one user does not have a role. All users must have a role.)'
    );
    assert.lengthOf(elemList, 1);
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step(
    'should be able to switch to second user, load assessment, and verify CSRF token',
    async function () {
      let student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
      config.userId = student.user_id;

      const res = await fetch(locals.assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());

      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    }
  );

  step(
    'first user should be able to edit role table to make both users manager',
    async function () {
      // Switch to first user
      await switchUserAndLoadAssessment(
        locals.studentUsers[0],
        locals.assessmentUrl,
        '00000001',
        2
      );

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

      // Make both first and second user manager
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[1].user_id },
      ];

      // Mark the checkboxes as checked
      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 2);
    }
  );

  step('should press submit button to perform the role updates', async function () {
    // Grab IDs of checkboxes to construct update request
    const checkedElementIds = {};
    for (let i = 0; i < elemList.length; i++) {
      checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
    }
    const form = {
      __action: 'update_group_roles',
      __csrf_token: locals.__csrf_token,
      ...checkedElementIds,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
  });

  step(
    'should have correct role configuration in the database after reassigning roles',
    async function () {
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));
      assert.sameDeepMembers(expected, result.rows);
    }
  );

  step(
    'should be able to switch to second user, load assessment, and verify CSRF token',
    async function () {
      let student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
      config.userId = student.user_id;

      const res = await fetch(locals.assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());

      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    }
  );

  step('group role table is visible and has two users in it', function () {
    elemList = locals.$('#role-select-form').find('tr');
    // Header row and two user rows
    assert.lengthOf(elemList, 3);
  });

  step('should have errors displayed for incorrect number of role assignments', function () {
    elemList = locals.$('.alert:contains(less person needs to be assigned)');
    assert.lengthOf(elemList, 1);
    elemList = locals.$('.alert:contains(more person needs to be assigned)');
    assert.lengthOf(elemList, 2);
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('second user should be able to leave group as manager', async function () {
    const form = {
      __action: 'leave_group',
      __csrf_token: locals.__csrf_token,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
  });

  step('second user should be able to load assessment', async function () {
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('second user should be able to join group again', async function () {
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step(
    'should have correct role configuration in the database after second user leaves and rejoins',
    async function () {
      const expectedRoleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      ];
      const expected = expectedRoleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      assert.sameDeepMembers(expected, result.rows);
    }
  );

  step('should be able to switch to third user and load assessment', async function () {
    let student = locals.studentUsers[2];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000003';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should be able to join group as third user', async function () {
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should not be able to start assessment as non-assigner', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should not render the group role table', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 0);
  });

  step('should display error for too few reflectors and too many recorders', function () {
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Reflector.)');
    assert.lengthOf(elemList, 1);
    elemList = locals.$('.alert:contains(1 less person needs to be assigned Recorder.)');
    assert.lengthOf(elemList, 1);
  });

  step('should have correct role configuration in the database for three users', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
    ];
    const expected = expectedRoleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should be able to switch to fourth user and load assessment', async function () {
    let student = locals.studentUsers[3];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000004';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should be able to join group as fourth user', async function () {
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should display error for too few reflectors and too many recorders', function () {
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Reflector.)');
    assert.lengthOf(elemList, 1);
    elemList = locals.$('.alert:contains(1 less person needs to be assigned Recorder.)');
    assert.lengthOf(elemList, 1);
  });

  step('should not render the group role table', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 0);
  });

  step('should have correct role configuration in the database for four users', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
      { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
    ];
    const expected = expectedRoleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should be able to switch back to first user and load assessment', async function () {
    let student = locals.studentUsers[0];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000001';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('group role table is visible and has four users in it', function () {
    elemList = locals.$('#role-select-form').find('tr');
    // Header row and four user rows
    assert.lengthOf(elemList, 5);
  });

  step('should be able to edit role table to correct configuration', function () {
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

    // Uncheck manager role in table to test whether Manager is correctly reassigned
    locals.assignerRoleUpdate = roleUpdates.shift();
    locals.roleUpdates = roleUpdates;

    // Mark the checkboxes as checked
    roleUpdates.forEach(({ roleId, groupUserId }) => {
      locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
    });
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 3);
  });

  step('should press submit button to perform the role updates', async function () {
    // Grab IDs of checkboxes to construct update request
    const checkedElementIds = {};
    for (let i = 0; i < elemList.length; i++) {
      checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
    }
    const form = {
      __action: 'update_group_roles',
      __csrf_token: locals.__csrf_token,
      ...checkedElementIds,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
  });

  step('should reload assessment page successfully', async function () {
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step(
    'should have correct role configuration in the database after reassigning roles',
    async function () {
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      // We expect the db to have all role updates, including the assigner role
      locals.roleUpdates.push(locals.assignerRoleUpdate);
      const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));
      assert.sameDeepMembers(expected, result.rows);
    }
  );

  step('should have all four roles checked once in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 4);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should have no errors displayed', function () {
    elemList = locals.$('.alert:contains(has too few assignments)');
    assert.lengthOf(elemList, 0);
    elemList = locals.$('.alert:contains(has too many assignments)');
    assert.lengthOf(elemList, 0);
  });

  step('should be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isFalse(elemList.is(':disabled'));
  });

  step('should be able to select the contributor role', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
    assert.lengthOf(elemList, 0);
  });

  step('should be able to assign too many recorders', function () {
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

  step('should be able to press submit button to perform the role updates', async function () {
    // Grab IDs of checkboxes to construct update request
    const checkedElementIds = {};
    for (let i = 0; i < elemList.length; i++) {
      checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
    }
    const form = {
      __action: 'update_group_roles',
      __csrf_token: locals.__csrf_token,
      ...checkedElementIds,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
  });

  step('should reload assessment page successfully', async function () {
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step(
    'should have correct role configuration in the database after assigning two recorders',
    async function () {
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));
      assert.sameDeepMembers(expected, result.rows);
    }
  );

  step('should have correct roles checked in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 4);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should display error for too many recorders', function () {
    elemList = locals.$('.alert:contains(1 less person needs to be assigned Recorder.)');
    assert.lengthOf(elemList, 1);
  });

  step('should edit role table to have two contributors', function () {
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

  step('should press submit button to perform the role updates', async function () {
    // Grab IDs of checkboxes to construct update request
    const checkedElementIds = {};
    for (let i = 0; i < elemList.length; i++) {
      checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
    }
    const form = {
      __action: 'update_group_roles',
      __csrf_token: locals.__csrf_token,
      ...checkedElementIds,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
  });

  step('should reload assessment page successfully', async function () {
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have correct role configuration in the database', async function () {
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should have correct roles checked in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 5);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should display error for a student having too many roles', function () {
    elemList = locals.$('.alert:contains(too many roles)');
    assert.lengthOf(elemList, 1);
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should be able to switch to fourth user and load assessment', async function () {
    let student = locals.studentUsers[3];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000004';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    // The only element with CSRF token is to leave the group
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 1);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should be able to leave the group as fourth user', async function () {
    await leaveGroup(locals.assessmentUrl);
  });

  step(
    'should have correct role configuration in the database after fourth user leaves',
    async function () {
      // Non-required roles are removed now that group size = # of required roles
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      ];
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));
      assert.sameDeepMembers(expected, result.rows);
    }
  );

  step('first user should see correct roles checked in the table', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 3);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should be able to join group as fourth user', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[3], locals.assessmentUrl, '00000004', 2);
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step(
    'should have correct role configuration in the database after fourth user joins again',
    async function () {
      // Fourth user receives contributor
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
      ];
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));
      assert.sameDeepMembers(expected, result.rows);
    }
  );

  step('first user should see correct roles checked in the table', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);

    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 4);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('fifth user should be able to join group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[4], locals.assessmentUrl, '00000005', 2);
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step(
    'should have correct role configuration in the database after fifth user joins',
    async function () {
      // Fifth user should have contributor role
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[4].user_id },
      ];
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));
      assert.sameDeepMembers(expected, result.rows);
    }
  );

  step('first user should see five roles checked in the table', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 5);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step(
    'should be able to swap recorder and contributor roles between second and fifth user',
    async function () {
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
        // Second user has contributor, fifth user has recorder
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[4].user_id },
      ];

      // Mark the checkboxes as checked
      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 5);
    }
  );

  step('should press submit button to perform the role updates', async function () {
    // Grab IDs of checkboxes to construct update request
    const checkedElementIds = {};
    for (let i = 0; i < elemList.length; i++) {
      checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
    }
    const form = {
      __action: 'update_group_roles',
      __csrf_token: locals.__csrf_token,
      ...checkedElementIds,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
  });

  step('should reload assessment page successfully', async function () {
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have correct role configuration in the database', async function () {
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should have correct roles checked in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 5);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should be able to switch to fifth user and load assessment', async function () {
    let student = locals.studentUsers[4];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000005';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should be able to leave the group as fifth user', async function () {
    const form = {
      __action: 'leave_group',
      __csrf_token: locals.__csrf_token,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should be able to switch to first user and load assessment', async function () {
    let student = locals.studentUsers[0];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000001';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 3);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step(
    'should have correct role configuration in the database after fifth user leaves',
    async function () {
      // Scenario 1: Recorder role is transferred from the leaving fifth user to the second user
      const roleUpdates1 = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
      ];
      // Scenario 2: Recorder role is transferred from the leaving fifth user to the fourth user
      const roleUpdates2 = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      // Assert that the recorder role is given to either the second or fourth user because
      // they previously had non-required roles
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      assert.lengthOf(result.rows, 4);

      const secondUserRoles = result.rows.filter(
        (row) => row.user_id === locals.studentUsers[1].user_id
      );
      assert.isTrue(secondUserRoles.length === 1);

      const secondUserRole = secondUserRoles[0];
      assert.isTrue(
        secondUserRole.group_role_id === locals.recorder.id ||
          secondUserRole.group_role_id === locals.contributor.id
      );

      const roleUpdates = secondUserRole.id === locals.recorder.id ? roleUpdates1 : roleUpdates2;
      const expected = roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));

      assert.sameDeepMembers(expected, result.rows);
      locals.roleUpdates = roleUpdates;
    }
  );

  step('should have correct roles checked in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 4);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step(
    'should be able to swap reflector and contributor roles between third and fourth user',
    async function () {
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
        // Third user has contributor, fourth user has reflector
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      // Mark the checkboxes as checked
      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 4);
    }
  );

  step('should press submit button to perform the role updates', async function () {
    // Grab IDs of checkboxes to construct update request
    const checkedElementIds = {};
    for (let i = 0; i < elemList.length; i++) {
      checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
    }
    const form = {
      __action: 'update_group_roles',
      __csrf_token: locals.__csrf_token,
      ...checkedElementIds,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
  });

  step('should reload assessment page successfully', async function () {
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have correct role configuration in the database', async function () {
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should have correct roles checked in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 4);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should be able to switch to fourth user and load assessment', async function () {
    let student = locals.studentUsers[3];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000004';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should be able to leave the group as fourth user', async function () {
    const form = {
      __action: 'leave_group',
      __csrf_token: locals.__csrf_token,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should be able to switch to first user and load assessment', async function () {
    let student = locals.studentUsers[0];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000001';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 3);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step(
    'should have correct role configuration in the database after fourth user leaves',
    async function () {
      // Fourth user's contributor role should replace third user's contributor role
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      ];
      const params = {
        assessment_id: locals.assessment_id,
      };
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
      const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));
      assert.sameDeepMembers(expected, result.rows);
    }
  );

  step('should have correct roles checked in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 3);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should be able to switch to third user and load assessment', async function () {
    let student = locals.studentUsers[2];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000003';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should be able to leave the group as third user', async function () {
    const form = {
      __action: 'leave_group',
      __csrf_token: locals.__csrf_token,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step(
    'should have reflector role transferred in database after third user leaves',
    async function () {
      const params = {
        assessment_id: locals.assessment_id,
      };
      // Scenario 1: Reflector is given to the first user
      const roleUpdates1 = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      ];
      // Scenario 2: Reflector is given to the second user
      const roleUpdates2 = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      ];

      // Assert that the reflector role is given to either first or second user
      const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
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
    }
  );

  step('should be able to switch to first user and load assessment', async function () {
    let student = locals.studentUsers[0];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000001';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 3);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should have correct roles checked in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 3);
    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('should be able to leave the group as first user', async function () {
    const form = {
      __action: 'leave_group',
      __csrf_token: locals.__csrf_token,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should be able to switch to second user and load assessment', async function () {
    let student = locals.studentUsers[1];
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000002';
    config.userId = student.user_id;

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should have transferred all required roles to second user in database', async function () {
    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[1].user_id },
    ];
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should have correct roles checked in the table', function () {
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    assert.lengthOf(elemList, 3);

    locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
      const elementId = `#user_role_${roleId}-${groupUserId}`;
      elemList = locals.$('#role-select-form').find(elementId);
      assert.lengthOf(elemList, 1);
      assert.isDefined(elemList['0'].attribs.checked);
    });
  });

  step('group role table is visible and has one user in it', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 2);
  });

  step(
    'should be able to switch to first user and load assessment without roles',
    async function () {
      let student = locals.studentUsers[0];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000001';
      config.userId = student.user_id;

      const res = await fetch(locals.assessmentUrlWithoutRoles);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    }
  );

  step('should have a CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('should be able to create a group in assessment without roles', async function () {
    locals.group_name = 'groupAA';
    const form = {
      __action: 'create_group',
      __csrf_token: locals.__csrf_token,
      groupName: locals.group_name,
    };
    const res = await fetch(locals.assessmentUrlWithoutRoles, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('group role table is not visible in assessment without roles', function () {
    elemList = locals.$('#role-select-form');
    assert.lengthOf(elemList, 0);
  });
});

/**
 * @param {string} courseDir
 * @param {GroupRole[]} groupRoles
 */
const changeGroupRolesConfig = async (courseDir, groupRoles) => {
  const infoAssessmentPath = path.join(
    courseDir,
    'courseInstances',
    'Sp15',
    'assessments',
    'hw5-templateGroupWork',
    'infoAssessment.json'
  );
  const infoAssessment = await fs.readJSON(infoAssessmentPath);
  infoAssessment.groupRoles = groupRoles;

  await fs.writeJSON(infoAssessmentPath, infoAssessment);
  await syncCourseData(courseDir);
};

describe('Test group role reassignments with role of minimum > 1', function () {
  /** @type {tmp.DirectoryResult} */
  let tempTestCourseDir;
  /** @type {tmp.DirectoryResult} */
  let assessmentId;
  let assessmentUrl;

  before('set authenticated user', function () {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });

  before('set up testing server', async function () {
    // Create a copy of the course that we can safely manipulate.
    tempTestCourseDir = await tmp.dir({ unsafeCleanup: true });
    await fs.copy(path.resolve(__dirname, '..', 'testCourse'), tempTestCourseDir.path, {
      overwrite: true,
    });

    await util.promisify(helperServer.before(tempTestCourseDir.path).bind(this))();

    // Find the ID of an assessment that has group roles
    const assessmentResults = await sqldb.queryOneRowAsync(sql.select_assessment, {
      tid: 'hw5-templateGroupWork',
    });
    assessmentId = assessmentResults.rows[0].id;
    assessmentUrl = locals.courseInstanceUrl + '/assessment/' + assessmentId;
  });

  after('shut down testing server', async function () {
    try {
      await tempTestCourseDir.cleanup();
    } catch (err) {
      console.error(err);
    }
    await util.promisify(helperServer.after.bind(this))();
  });

  after('unset authenticated user', function () {
    Object.assign(config, storedConfig);
  });

  step('change group config to include a role with minimum of two', async function () {
    const groupRoles = [
      {
        name: 'Manager',
        minimum: 1,
        maximum: 1,
        canAssignRolesAtStart: true,
        canAssignRolesDuringAssessment: true,
      },
      { name: 'Recorder', minimum: 2, maximum: 2 },
      { name: 'Reflector', minimum: 1, maximum: 1 },
      { name: 'Contributor' },
    ];
    await changeGroupRolesConfig(tempTestCourseDir.path, groupRoles);
    const groupRolesResult = await sqldb.queryAsync(sql.select_assessment_group_roles, {
      assessment_id: assessmentId,
    });
    assert.lengthOf(groupRolesResult.rows, 4);
    locals.groupRoles = groupRolesResult.rows;

    const manager = groupRolesResult.rows.find((row) => row.role_name === 'Manager');
    assert.isDefined(manager);
    locals.manager = manager;

    const recorder = groupRolesResult.rows.find((row) => row.role_name === 'Recorder');
    assert.isDefined(recorder);
    assert.equal(2, recorder.minimum);
    assert.equal(2, recorder.maximum);
    locals.recorder = recorder;

    const reflector = groupRolesResult.rows.find((row) => row.role_name === 'Reflector');
    assert.isDefined(reflector);
    locals.reflector = reflector;

    const contributor = groupRolesResult.rows.find((row) => row.role_name === 'Contributor');
    assert.isDefined(contributor);
    locals.contributor = contributor;

    // Insert/get 5 users into/from the DB
    const enrolledUsersResult = await sqldb.queryAsync(sql.generate_and_enroll_5_users, []);
    assert.lengthOf(enrolledUsersResult.rows, 5);
    locals.studentUsers = enrolledUsersResult.rows;

    // Switch current user to the group creator and load assessment
    config.authUid = locals.studentUsers[0].uid;
    config.authName = locals.studentUsers[0].name;
    config.authUin = '00000001';
    config.userId = locals.studentUsers[0].user_id;
    const res = await fetch(assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('first user should have CSRF token', function () {
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);
  });

  step('create group as first user', async function () {
    locals.group_name = 'groupBB';
    const form = {
      __action: 'create_group',
      __csrf_token: locals.__csrf_token,
      groupName: locals.group_name,
    };
    const joinRes = await fetch(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(joinRes.ok);
    locals.$ = cheerio.load(await joinRes.text());

    // Grab join code
    elemList = locals.$('#join-code');
    locals.joinCode = elemList.text();
    assert.lengthOf(locals.joinCode, locals.$('#group-name').text().length + 1 + 4);
  });

  step('check role configuration', async function () {
    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
    ];
    const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    const params = {
      assessment_id: assessmentId,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    assert.sameDeepMembers(expected, result.rows);
  });

  step('second user should be able to join group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[1], assessmentUrl, '00000002', 2);
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should have correct role configuration in the database for two users', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
    ];
    const expected = expectedRoleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    const params = {
      assessment_id: assessmentId,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should not render the group role table for non-assigner', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 0);
  });

  step('should display correct errors for too few role assignments', function () {
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Reflector.)');
    assert.lengthOf(elemList, 1);
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Reflector.)');
    assert.lengthOf(elemList, 1);
  });

  step('should be able to join group as third user', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[2], assessmentUrl, '00000003', 2);
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should not be able to start assessment as non-assigner', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should not render the group role table', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 0);
  });

  step('should display error for too few reflectors', function () {
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Reflector.)');
    assert.lengthOf(elemList, 1);
  });

  step('should display no errors for recorders', function () {
    elemList = locals.$('.alert:contains(Recorder)');
    assert.lengthOf(elemList, 0);
  });

  step('should have correct role configuration in the database for three users', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
    ];
    const expected = expectedRoleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    const params = {
      assessment_id: assessmentId,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    assert.sameDeepMembers(expected, result.rows);
  });

  step('should be able to join group as fourth user', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[3], assessmentUrl, '00000004', 2);
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should display error for too few reflectors and too many recorders', function () {
    elemList = locals.$('.alert:contains(1 more person needs to be assigned Reflector.)');
    assert.lengthOf(elemList, 1);
    elemList = locals.$('.alert:contains(1 less person needs to be assigned Recorder.)');
    assert.lengthOf(elemList, 1);
  });

  step('should not render the group role table', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 0);
  });

  step('should have correct role configuration in the database for four users', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[3].user_id },
    ];
    const expected = expectedRoleUpdates.map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }));
    const params = {
      assessment_id: assessmentId,
    };
    const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
    assert.sameDeepMembers(expected, result.rows);
  });

  step('switch back to first user and load group role table', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 2);
  });

  step('group role table is visible and has four users in it', function () {
    elemList = locals.$('#role-select-form').find('tr');
    // Header row and four user rows
    assert.lengthOf(elemList, 5);
  });

  step('should not be able to select the contributor role', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
    assert.lengthOf(elemList, 1);
    elemList = elemList.next();
    assert.equal(elemList.text().trim(), locals.contributor.role_name);
  });

  describe('test correct role config where group size matches minimum required role count', function () {
    step('should be able to edit role table to correct configuration', function () {
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
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      // Uncheck manager role in table to test whether Manager is correctly reassigned
      locals.assignerRoleUpdate = roleUpdates.shift();
      locals.roleUpdates = roleUpdates;

      // Mark the checkboxes as checked
      roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 3);
    });

    step('should press submit button to perform the role updates', async function () {
      // Grab IDs of checkboxes to construct update request
      const checkedElementIds = {};
      for (let i = 0; i < elemList.length; i++) {
        checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
      }
      const form = {
        __action: 'update_group_roles',
        __csrf_token: locals.__csrf_token,
        ...checkedElementIds,
      };
      const res = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
    });

    step('should reload assessment page successfully', async function () {
      const res = await fetch(assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });

    step(
      'should have correct role configuration in the database after reassigning roles',
      async function () {
        const params = {
          assessment_id: assessmentId,
        };
        const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
        // We expect the db to have all role updates, including the assigner role
        locals.roleUpdates.push(locals.assignerRoleUpdate);
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
      }
    );

    step('should have all four roles checked once in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 4);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });

    step('should have no errors displayed', function () {
      elemList = locals.$('.alert:contains(to be assigned)');
      assert.lengthOf(elemList, 0);
      elemList = locals.$(
        '.alert:contains(At least one user does not have a role. All users must have a role.)'
      );
      assert.lengthOf(elemList, 0);
    });

    step('should not be able to select the contributor role', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
      assert.lengthOf(elemList, 1);
      elemList = elemList.next();
      assert.equal(elemList.text().trim(), locals.contributor.role_name);
    });

    step('should be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isFalse(elemList.is(':disabled'));
    });
  });

  describe('test correct role config where group size exceeds minimum required role count', function () {
    step('fifth user should be able to join group', async function () {
      await switchUserAndLoadAssessment(locals.studentUsers[4], assessmentUrl, '00000005', 2);
      const form = {
        __action: 'join_group',
        __csrf_token: locals.__csrf_token,
        join_code: locals.joinCode,
      };
      const res = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });

    step(
      'should have correct role configuration in the database after fifth user joins',
      async function () {
        // Fifth user should have contributor role
        locals.roleUpdates = [
          { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
          { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
          { roleId: locals.contributor.id, groupUserId: locals.studentUsers[4].user_id },
        ];
        const params = {
          assessment_id: assessmentId,
        };
        const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
      }
    );

    step('switch back to first user and load group role table', async function () {
      await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 3);
    });

    step('group role table is visible and has five users in it', function () {
      elemList = locals.$('#role-select-form').find('tr');
      // Header row and five user rows
      assert.lengthOf(elemList, 6);
    });

    step('should have all five roles checked once in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 5);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });

    step('should have no errors displayed', function () {
      elemList = locals.$('.alert:contains(to be assigned)');
      assert.lengthOf(elemList, 0);
      elemList = locals.$(
        '.alert:contains(At least one user does not have a role. All users must have a role.)'
      );
      assert.lengthOf(elemList, 0);
    });

    step('should be able to select the contributor role', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
      assert.lengthOf(elemList, 0);
    });

    step('should be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isFalse(elemList.is(':disabled'));
    });
  });

  describe('test incorrect role config where group size exceeds minimum required role count', function () {
    step('should be able to edit role table to add extra contributor', function () {
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

      // Third user receives contributor
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[4].user_id },
      ];

      // Mark the checkboxes as checked
      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 6);
    });

    step('should press submit button to perform the role updates', async function () {
      // Grab IDs of checkboxes to construct update request
      const checkedElementIds = {};
      for (let i = 0; i < elemList.length; i++) {
        checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
      }
      const form = {
        __action: 'update_group_roles',
        __csrf_token: locals.__csrf_token,
        ...checkedElementIds,
      };
      const res = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
    });

    step('should reload assessment page successfully', async function () {
      const res = await fetch(assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });

    step(
      'should have correct role configuration in the database after reassigning roles',
      async function () {
        const params = {
          assessment_id: assessmentId,
        };
        const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
      }
    );

    step('should have all six roles checked once in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 6);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });

    step('should have correct errors displayed', function () {
      elemList = locals.$(
        '.alert:contains(A user has too many roles. Every student should be assigned to exactly one role with group size 5)'
      );
      assert.lengthOf(elemList, 1);
    });

    step('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });

    step('should be able to leave as fifth user', async function () {
      // Switch to fifth user
      await switchUserAndLoadAssessment(locals.studentUsers[4], assessmentUrl, '00000005', 1);

      // Leave as fifth user
      const form = {
        __action: 'leave_group',
        __csrf_token: locals.__csrf_token,
      };
      const res = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });
  });

  describe('test incorrect role config where user has no roles', function () {
    step(
      'first user should be able to edit role table to remove a recorder assignment',
      async function () {
        // Switch to first user and load assessment
        await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 3);

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

        // Remove recorder assignment from second user
        locals.roleUpdates = [
          { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
          { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
        ];

        // Mark the checkboxes as checked
        locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
          locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
        });
        elemList = locals.$('#role-select-form').find('tr').find('input:checked');
        assert.lengthOf(elemList, 3);
      }
    );

    step('should press submit button to perform the role updates', async function () {
      // Grab IDs of checkboxes to construct update request
      const checkedElementIds = {};
      for (let i = 0; i < elemList.length; i++) {
        checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
      }
      const form = {
        __action: 'update_group_roles',
        __csrf_token: locals.__csrf_token,
        ...checkedElementIds,
      };
      const res = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
    });

    step('should reload assessment page successfully', async function () {
      const res = await fetch(assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });

    step(
      'should have correct role configuration in the database after reassigning roles',
      async function () {
        const params = {
          assessment_id: assessmentId,
        };
        const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
      }
    );

    step('should have all three roles checked once in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 3);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });

    step('should have correct errors displayed', function () {
      elemList = locals.$(
        '.alert:contains(1 more person needs to be assigned Recorder. (Found 1, expected exactly 2).)'
      );
      assert.lengthOf(elemList, 0);
      elemList = locals.$(
        '.alert:contains(At least one user does not have a role. All users must have a role.)'
      );
      assert.lengthOf(elemList, 1);
    });

    step('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
  });

  describe('test incorrect role config where roles are unbalanced', function () {
    step('should be able to edit role table to add too many roles to assigner', function () {
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

      // Give first user both manager and recorder
      // Leave fourth user without a role
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      ];

      // Mark the checkboxes as checked
      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
      });
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 4);
    });

    step('should press submit button to perform the role updates', async function () {
      // Grab IDs of checkboxes to construct update request
      const checkedElementIds = {};
      for (let i = 0; i < elemList.length; i++) {
        checkedElementIds[elemList[i.toString()].attribs.id] = 'on';
      }
      const form = {
        __action: 'update_group_roles',
        __csrf_token: locals.__csrf_token,
        ...checkedElementIds,
      };
      const res = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
    });

    step('should reload assessment page successfully', async function () {
      const res = await fetch(assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });

    step(
      'should have correct role configuration in the database after reassigning roles',
      async function () {
        const params = {
          assessment_id: assessmentId,
        };
        const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
      }
    );

    step('should have all four roles checked once in the table', function () {
      elemList = locals.$('#role-select-form').find('tr').find('input:checked');
      assert.lengthOf(elemList, 4);

      locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
        const elementId = `#user_role_${roleId}-${groupUserId}`;
        elemList = locals.$('#role-select-form').find(elementId);
        assert.lengthOf(elemList, 1);
        assert.isDefined(elemList['0'].attribs.checked);
      });
    });

    step('should have correct errors displayed', function () {
      elemList = locals.$('.alert:contains(to be assigned Recorder.)');
      assert.lengthOf(elemList, 0);

      elemList = locals.$(
        '.alert:contains(At least one user does not have a role. All users must have a role.)'
      );
      assert.lengthOf(elemList, 1);

      elemList = locals.$(
        '.alert:contains(A user has too many roles. Every student should be assigned to exactly one role with group size 4)'
      );
      assert.lengthOf(elemList, 1);
    });

    step('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
  });

  describe('test correct role config where group size falls below minimum required role count', function () {
    step('should be able to leave as fourth user', async function () {
      await switchUserAndLoadAssessment(locals.studentUsers[3], assessmentUrl, '00000004', 1);

      // Leave as fourth user
      const form = {
        __action: 'leave_group',
        __csrf_token: locals.__csrf_token,
      };
      const res = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });

    step(
      'should have correct role configuration in the database after fourth user leaves',
      async function () {
        const params = {
          assessment_id: assessmentId,
        };
        const result = await sqldb.queryAsync(sql.select_group_user_roles, params);
        locals.roleUpdates = [
          { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[0].user_id },
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
          { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        ];
        const expected = locals.roleUpdates.map(({ roleId, groupUserId }) => ({
          user_id: groupUserId,
          group_role_id: roleId,
        }));
        assert.sameDeepMembers(expected, result.rows);
      }
    );

    step('switch back to first user and load group role table', async function () {
      await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 3);
    });

    step('group role table is visible and has three users in it', function () {
      elemList = locals.$('#role-select-form').find('tr');
      // Header row and two user rows
      assert.lengthOf(elemList, 4);
    });

    step('should not be able to select the contributor role', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
      assert.lengthOf(elemList, 1);
      elemList = elemList.next();
      assert.equal(elemList.text().trim(), locals.contributor.role_name);
    });

    step('should be able to leave as first user', async function () {
      const form = {
        __action: 'leave_group',
        __csrf_token: locals.__csrf_token,
      };
      const res = await fetch(assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
    });

    step(
      'should have correct role configuration in the database after first user leaves',
      async function () {
        const params = {
          assessment_id: assessmentId,
        };
        const result = await sqldb.queryAsync(sql.select_group_user_roles, params);

        // Ensure that there are two recorder assignments, one manager, and one reflector, and no contributors
        assert.lengthOf(
          result.rows.filter(({ group_role_id }) => group_role_id === locals.manager.id),
          1
        );
        assert.lengthOf(
          result.rows.filter(({ group_role_id }) => group_role_id === locals.recorder.id),
          2
        );
        assert.lengthOf(
          result.rows.filter(({ group_role_id }) => group_role_id === locals.reflector.id),
          1
        );
        assert.lengthOf(
          result.rows.filter(({ group_role_id }) => group_role_id === locals.contributor.id),
          0
        );
      }
    );
  });
});

describe('Test group role reassignment logic when user leaves', function () {
  this.timeout(20000);
  before('set authenticated user', function () {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });
  before('set up testing server', helperServer.before(locals.courseDir));
  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function () {
    Object.assign(config, storedConfig);
  });

  step('should contain a group-based homework assessment with roles', async function () {
    const result = await sqldb.queryAsync(sql.select_group_work_assessment_with_roles, []);
    assert.lengthOf(result.rows, 1);
    assert.notEqual(result.rows[0].id, undefined);
    locals.assessment_id = result.rows[0].id;
    locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
  });

  step('should contain the 4 group roles for the assessment', async function () {
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryAsync(sql.select_assessment_group_roles, params);
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
  });

  step('should insert/get 5 users into/from the DB', async function () {
    const result = await sqldb.queryAsync(sql.generate_and_enroll_5_users, []);
    assert.lengthOf(result.rows, 5);
    locals.studentUsers = result.rows;
  });

  step('should setup group info', async function () {
    locals.groupId = '1';
    locals.groupName = '1';
    locals.groupMembers = locals.studentUsers.map((user) => ({
      ...user,
      group_name: locals.groupName,
    }));
    locals.rolesInfo = {
      roleAssignments: {},
      groupRoles: locals.groupRoles,
      validationErrors: [],
      disabledRoles: [],
      rolesAreBalanced: true,
      usersWithoutRoles: [],
    };
    locals.groupInfo = {
      groupMembers: locals.groupMembers,
      groupSize: locals.groupMembers.length,
      groupName: locals.groupName,
      joinCode: locals.joinCode,
      start: false,
      rolesInfo: locals.rolesInfo,
    };
  });

  step(
    'should transfer required roles to another user when there are no non-required roles to replace',
    function () {
      // Setup group of 2 users with one user as manager and the other user as recorder
      locals.groupInfo.groupMembers = locals.groupMembers.slice(0, 2);
      locals.groupInfo.groupSize = 2;
      const roleAssignments = [
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.manager.id,
        },
        {
          user_id: locals.studentUsers[1].user_id,
          group_role_id: locals.recorder.id,
        },
      ];
      locals.groupInfo.rolesInfo.groupRoles = locals.groupRoles.map((role) => ({
        ...role,
        count: roleAssignments.filter((roleAssignment) => roleAssignment.group_role_id === role.id)
          .length,
      }));
      locals.rolesInfo.roleAssignments = roleAssignments;

      // Get role reassignments if second user leaves
      const result = getGroupRoleReassignmentsAfterLeave(
        locals.groupInfo,
        locals.studentUsers[1].user_id
      );
      // Recorder role should be transferred to first user
      const expected = [
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.manager.id,
        },
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.recorder.id,
        },
      ];
      assert.sameDeepMembers(result, expected);
    }
  );

  step(
    "should replace another user's non-required role with leaving user's required role",
    function () {
      // Setup group of 2 users with one user as manager and the other user as recorder
      locals.groupInfo.groupMembers = locals.groupMembers.slice(0, 2);
      locals.groupInfo.groupSize = 2;
      const roleAssignments = [
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.manager.id,
        },
        {
          user_id: locals.studentUsers[1].user_id,
          group_role_id: locals.contributor.id,
        },
      ];
      locals.groupInfo.rolesInfo.groupRoles = locals.groupRoles.map((role) => ({
        ...role,
        count: roleAssignments.filter((roleAssignment) => roleAssignment.group_role_id === role.id)
          .length,
      }));
      locals.rolesInfo.roleAssignments = roleAssignments;

      // Get role reassignments if first user leaves
      const result = getGroupRoleReassignmentsAfterLeave(
        locals.groupInfo,
        locals.studentUsers[0].user_id
      );
      // Manager role should replace first user's contributor role
      const expected = [
        {
          user_id: locals.studentUsers[1].user_id,
          group_role_id: locals.manager.id,
        },
      ];
      assert.sameDeepMembers(result, expected);
    }
  );

  step(
    "should replace other users' non-required roles with leaving user's required roles",
    function () {
      // Setup group of 3 users with first user as manager AND reflector, and the other users as contributors
      locals.groupInfo.groupMembers = locals.groupMembers.slice(0, 3);
      locals.groupInfo.groupSize = 3;
      const roleAssignments = [
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.manager.id,
        },
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.reflector.id,
        },
        {
          user_id: locals.studentUsers[1].user_id,
          group_role_id: locals.contributor.id,
        },
        {
          user_id: locals.studentUsers[2].user_id,
          group_role_id: locals.contributor.id,
        },
      ];
      locals.groupInfo.rolesInfo.groupRoles = locals.groupRoles.map((role) => ({
        ...role,
        count: roleAssignments.filter((roleAssignment) => roleAssignment.group_role_id === role.id)
          .length,
      }));
      locals.rolesInfo.roleAssignments = roleAssignments;

      // Get role reassignments if first user leaves
      const result = getGroupRoleReassignmentsAfterLeave(
        locals.groupInfo,
        locals.studentUsers[0].user_id
      );
      // Case 1: Manager role should replace second user's contributor role, and
      // reflector role should replace third user's contributor role
      const expected1 = [
        {
          user_id: locals.studentUsers[1].user_id,
          group_role_id: locals.manager.id,
        },
        {
          user_id: locals.studentUsers[2].user_id,
          group_role_id: locals.reflector.id,
        },
      ];
      const expected2 = [
        {
          user_id: locals.studentUsers[2].user_id,
          group_role_id: locals.manager.id,
        },
        {
          user_id: locals.studentUsers[1].user_id,
          group_role_id: locals.reflector.id,
        },
      ];

      assert.lengthOf(result, 2);
      // If second user receives manager, we expect case 1; otherwise, we expect case 2
      const secondUserRoleAssignment = result.find(
        ({ user_id }) => user_id === locals.studentUsers[1].user_id
      );
      assert.isDefined(secondUserRoleAssignment);
      const expected =
        secondUserRoleAssignment.group_role_id === locals.manager.id ? expected1 : expected2;
      assert.sameDeepMembers(result, expected);
    }
  );

  step(
    "should replace other users' non-required roles with leaving user's required roles, then transfer after non-required roles run out",
    function () {
      // Setup group of 3 users with one user as manager, recorder, and reflector, and the other users as contributor
      locals.groupInfo.groupMembers = locals.groupMembers.slice(0, 3);
      locals.groupInfo.groupSize = 3;
      const roleAssignments = [
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.manager.id,
        },
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.recorder.id,
        },
        {
          user_id: locals.studentUsers[0].user_id,
          group_role_id: locals.reflector.id,
        },
        {
          user_id: locals.studentUsers[1].user_id,
          group_role_id: locals.contributor.id,
        },
        {
          user_id: locals.studentUsers[2].user_id,
          group_role_id: locals.contributor.id,
        },
      ];
      locals.groupInfo.rolesInfo.groupRoles = locals.groupRoles.map((role) => ({
        ...role,
        count: roleAssignments.filter((roleAssignment) => roleAssignment.group_role_id === role.id)
          .length,
      }));
      locals.rolesInfo.roleAssignments = roleAssignments;

      // Get role reassignments if first user leaves
      const result = getGroupRoleReassignmentsAfterLeave(
        locals.groupInfo,
        locals.studentUsers[0].user_id
      );

      // Ensure that there is a single role assignment for manager, recorder, and reflector each
      assert.lengthOf(
        result.filter(({ group_role_id }) => group_role_id === locals.manager.id),
        1
      );
      assert.lengthOf(
        result.filter(({ group_role_id }) => group_role_id === locals.recorder.id),
        1
      );
      assert.lengthOf(
        result.filter(({ group_role_id }) => group_role_id === locals.reflector.id),
        1
      );

      // Ensure that there are no contributors
      assert.lengthOf(
        result.filter(({ group_role_id }) => group_role_id === locals.contributor.id),
        0
      );
    }
  );

  step('should not transfer non-required roles to another user', function () {
    // Setup group of 2 users with one user as manager and the other user as contributor
    locals.groupInfo.groupMembers = locals.groupMembers.slice(0, 2);
    locals.groupInfo.groupSize = 2;
    const roleAssignments = [
      {
        user_id: locals.studentUsers[0].user_id,
        group_role_id: locals.manager.id,
      },
      {
        user_id: locals.studentUsers[1].user_id,
        group_role_id: locals.contributor.id,
      },
    ];
    locals.groupInfo.rolesInfo.groupRoles = locals.groupRoles.map((role) => ({
      ...role,
      count: roleAssignments.filter((roleAssignment) => roleAssignment.group_role_id === role.id)
        .length,
    }));
    locals.rolesInfo.roleAssignments = roleAssignments;

    // Get role reassignments if second user leaves
    const result = getGroupRoleReassignmentsAfterLeave(
      locals.groupInfo,
      locals.studentUsers[1].user_id
    );
    // Recorder role should be transferred to first user
    const expected = [
      {
        user_id: locals.studentUsers[0].user_id,
        group_role_id: locals.manager.id,
      },
    ];
    assert.sameDeepMembers(result, expected);
  });

  step('should do nothing when leaving user has no roles', function () {
    // Setup group of 2 users with one user as manager and the other user without roles
    locals.groupInfo.groupMembers = locals.groupMembers.slice(0, 2);
    locals.groupInfo.groupSize = 2;
    const roleAssignments = [
      {
        user_id: locals.studentUsers[0].user_id,
        group_role_id: locals.manager.id,
      },
    ];
    locals.groupInfo.rolesInfo.groupRoles = locals.groupRoles.map((role) => ({
      ...role,
      count: roleAssignments.filter((roleAssignment) => roleAssignment.group_role_id === role.id)
        .length,
    }));
    locals.rolesInfo.roleAssignments = roleAssignments;

    // Get role reassignments if second user leaves
    const result = getGroupRoleReassignmentsAfterLeave(
      locals.groupInfo,
      locals.studentUsers[1].user_id
    );
    // Recorder role should be transferred to first user
    const expected = [
      {
        user_id: locals.studentUsers[0].user_id,
        group_role_id: locals.manager.id,
      },
    ];
    assert.sameDeepMembers(result, expected);
  });
});
