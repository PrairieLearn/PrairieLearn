const assert = require('chai').assert;
const cheerio = require('cheerio');
const fetch = require('node-fetch').default;
const path = require('path');
const { step } = require('mocha-steps');

const config = require('../lib/config');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const { URLSearchParams } = require('url');

let elemList;
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

  step('should switch current user to the group creator and load assessment', async function () {
    config.authUid = locals.studentUsers[0].uid;
    config.authName = locals.studentUsers[0].name;
    config.authUin = '00000001';
    config.userId = locals.studentUsers[0].user_id;

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

  step('should be able to create a group', async function () {
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

  step('manager should be able to leave the group', async function () {
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

  step('should load assessment page successfully', async function () {
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

  step('second user should be able to join group', async function () {
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
    assert.lengthOf(elemList, 4);

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

  step('fifth user should be able to join group', async function () {
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

  step('should have five roles checked in the table', function () {
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
