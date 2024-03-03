import { assert } from 'chai';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import * as fs from 'fs-extra';
import * as path from 'path';
import { step } from 'mocha-steps';
import * as tmp from 'tmp-promise';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';
import { syncCourseData, type GroupRole } from './sync/util';

import * as helperServer from './helperServer';
import { getGroupRoleReassignmentsAfterLeave } from '../lib/groups';
import { TEST_COURSE_PATH } from '../lib/paths';

const sql = sqldb.loadSqlEquiv(__filename);

let elemList;
const locals: Record<string, any> = {};
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';
locals.courseDir = TEST_COURSE_PATH;

const storedConfig: Record<string, any> = {};

/**
 * Switches `config` to new user, loads assessment page, and changes local CSRF token
 */
async function switchUserAndLoadAssessment(
  studentUser: { uid: string; name: string },
  assessmentUrl: string,
  authUin: string,
  numCsrfTokens: number,
) {
  // Load config
  config.authUid = studentUser.uid;
  config.authName = studentUser.name;
  config.authUin = authUin;

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
}

/**
 * Joins group as current user with CSRF token and loads page with cheerio.
 */
async function joinGroup(assessmentUrl: string, joinCode: string) {
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
}

/**
 * Leaves group as current user
 */
async function leaveGroup(assessmentUrl: string) {
  const form = {
    __action: 'leave_group',
    __csrf_token: locals.__csrf_token,
  };
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams(form),
  });
  assert.isOk(res.ok);
}

async function verifyRoleAssignmentsInDatabase(
  roleAssignments: { roleId: number; groupUserId: number }[],
  assessmentId: string,
) {
  const expected = roleAssignments
    .map(({ roleId, groupUserId }) => ({
      user_id: groupUserId,
      group_role_id: roleId,
    }))
    .sort((a, b) => a.user_id - b.user_id || a.group_role_id - b.group_role_id);
  const result = await sqldb.queryAsync(sql.select_group_user_roles, {
    assessment_id: assessmentId,
  });
  assert.sameDeepMembers(result.rows, expected);
}

/**
 * Asserts that role table contains checked roles corresponding to role assignments.
 * The role table must be visible through cheerio.
 */
function verifyRoleAssignmentsInRoleTable(
  roleAssignments: { roleId: string; groupUserId: string }[],
) {
  elemList = locals.$('#role-select-form').find('tr').find('input:checked');
  assert.lengthOf(elemList, roleAssignments.length);

  locals.roleUpdates.forEach(({ roleId, groupUserId }) => {
    const elementId = `#user_role_${roleId}-${groupUserId}`;
    elemList = locals.$('#role-select-form').find(elementId);
    assert.lengthOf(elemList, 1);
    assert.isDefined(elemList['0'].attribs.checked);
  });
}

/**
 * Sends and verifies a group roles update request using current user.
 * Updates element list to check that group role select table is changed correctly.
 */
async function updateGroupRoles(
  roleUpdates: { roleId: string; groupUserId: string }[],
  groupRoles: { id: string }[],
  studentUsers: { user_id: string }[],
  assessmentUrl: string,
) {
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

  // Mark the checkboxes as checked
  roleUpdates.forEach(({ roleId, groupUserId }) => {
    locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
  });
  elemList = locals.$('#role-select-form').find('tr').find('input:checked');
  assert.lengthOf(elemList, roleUpdates.length);

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
}

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

  step('contains a group-based homework assessment with roles', async function () {
    const result = await sqldb.queryAsync(sql.select_group_work_assessment_with_roles, []);
    assert.lengthOf(result.rows, 1);
    assert.notEqual(result.rows[0].id, undefined);
    locals.assessment_id = result.rows[0].id;
    locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
  });

  step('contains a group-based homework assessment without roles', async function () {
    const result = await sqldb.queryAsync(sql.select_group_work_assessment_without_roles, []);
    assert.lengthOf(result.rows, 1);
    assert.notEqual(result.rows[0].id, undefined);
    assert.equal(result.rows[0].has_roles, false);
    locals.assessment_id_without_roles = result.rows[0].id;
    locals.assessmentUrlWithoutRoles =
      locals.courseInstanceUrl + '/assessment/' + locals.assessment_id_without_roles;
  });

  step('contains the 4 group roles for the assessment', async function () {
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

  step('can insert/get 5 users into/from the DB', async function () {
    const result = await sqldb.queryAsync(sql.generate_and_enroll_5_users, []);
    assert.lengthOf(result.rows, 5);
    locals.studentUsers = result.rows;
  });

  step('can create a group as first user', async function () {
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
    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
  });

  step('contains the 4-character join code', function () {
    elemList = locals.$('#join-code');
    locals.joinCode = elemList.text();
    assert.lengthOf(locals.joinCode, locals.$('#group-name').text().length + 1 + 4);
  });

  step('group role table is visible and has one user in it', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 2);
  });

  step('contains four textboxes per table row', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input');
    assert.lengthOf(elemList, 4);
  });

  step('should have only manager role checked in the role table', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:checked');
    assert.lengthOf(elemList, 1);

    elemList = elemList.parent('label');
    assert.equal(elemList.text().trim(), locals.manager.role_name);
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('displays error for too few recorders/reflectors', function () {
    elemList = locals.$(
      '.alert:contains(1 more student needs to be assigned to the role "Reflector")',
    );
    assert.lengthOf(elemList, 1);
    elemList = locals.$(
      '.alert:contains(1 more student needs to be assigned to the role "Recorder")',
    );
    assert.lengthOf(elemList, 1);
  });

  step('cannot select the contributor role', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
    assert.lengthOf(elemList, 1);
    elemList = elemList.parent('label');
    assert.equal(elemList.text().trim(), locals.contributor.role_name);
  });

  step('should be missing 1 more group members to start', function () {
    elemList = locals.$('.text-center:contains(1 more)');
    assert.lengthOf(elemList, 1);
  });

  step('should have no role assignments in the database after assigner leaves', async function () {
    await leaveGroup(locals.assessmentUrl);

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    const result = await sqldb.queryAsync(sql.select_group_user_roles, {
      assessment_id: locals.assessment_id,
    });

    // Since there are no users currently in the group, there must be no role assignments
    assert.lengthOf(result.rows, 0);
  });

  step('assigns first user to manager role after re-joining', async function () {
    await joinGroup(locals.assessmentUrl, locals.joinCode);

    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
    ];
    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
  });

  step('group role table is visible and has one user in it', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 2);
  });

  step('second user should join group as recorder', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[1], locals.assessmentUrl, '00000002', 2);
    await joinGroup(locals.assessmentUrl, locals.joinCode);

    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
    ];
    await verifyRoleAssignmentsInDatabase(expectedRoleUpdates, locals.assessment_id);
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('does not enable the group role table for non-assigner', function () {
    elemList = locals.$('#role-select-form').find('input:not([disabled])');
    assert.lengthOf(elemList, 0);
  });

  step('displays error for too few reflectors', function () {
    elemList = locals.$(
      '.alert:contains(1 more student needs to be assigned to the role "Reflector")',
    );
    assert.lengthOf(elemList, 1);
  });

  step('first user sees group role select table with two rows', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);

    elemList = locals.$('#role-select-form').find('tr');
    // Header row and two user rows
    assert.lengthOf(elemList, 3);
  });

  step('first user should be able to remove role assignments from second user', async function () {
    // Remove role assignments from second user
    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
    ];
    await updateGroupRoles(
      locals.roleUpdates,
      locals.groupRoles,
      locals.studentUsers,
      locals.assessmentUrl,
    );
  });

  step('second user should have no roles after update', async function () {
    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);

    // Reload assessment and verify in UI
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
    verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
  });

  step('should have error displayed for requiring all users have a role', function () {
    elemList = locals.$(
      '.alert:contains(At least one user does not have a role. All users must have a role.)',
    );
    assert.lengthOf(elemList, 1);
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('can switch to second user and load assessment without error', async function () {
    // By loading assessment as second user, we verify that an assessment can be loaded
    // by a user with no role assignments
    await switchUserAndLoadAssessment(locals.studentUsers[1], locals.assessmentUrl, '00000002', 2);
  });

  step('second user cannot update roles as non-assigner', async function () {
    const roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
    ];

    const checkedElementIds = {};
    for (const { roleId, groupUserId } of roleUpdates) {
      checkedElementIds[`user_role_${groupUserId}-${roleId}`] = 'on';
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

    // Second user cannot update group roles
    assert.isNotOk(res.ok);
    assert.equal(res.status, 403);
  });

  step('first user can edit role table to make both users manager', async function () {
    // Switch to first user
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);

    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[1].user_id },
    ];
    await updateGroupRoles(
      locals.roleUpdates,
      locals.groupRoles,
      locals.studentUsers,
      locals.assessmentUrl,
    );
  });

  step(
    'second user can load assessment as manager and see group role select table',
    async function () {
      await switchUserAndLoadAssessment(
        locals.studentUsers[1],
        locals.assessmentUrl,
        '00000002',
        3,
      );

      elemList = locals.$('#role-select-form').find('tr');
      // Header row and two user rows
      assert.lengthOf(elemList, 3);
    },
  );

  step('displays errors for incorrect number of role assignments', function () {
    elemList = locals.$('.alert:contains(less student needs to be assigned)');
    assert.lengthOf(elemList, 1);
    elemList = locals.$('.alert:contains(more student needs to be assigned)');
    assert.lengthOf(elemList, 2);
  });

  step('should not be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('second user can leave group as manager and rejoin without error', async function () {
    await leaveGroup(locals.assessmentUrl);

    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);

    await joinGroup(locals.assessmentUrl, locals.joinCode);
  });

  step(
    'database contains correct role configuration after second user leaves and rejoins',
    async function () {
      const expectedRoleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      ];
      await verifyRoleAssignmentsInDatabase(expectedRoleUpdates, locals.assessment_id);
    },
  );

  step('third user can load assessment and join group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[2], locals.assessmentUrl, '00000003', 2);
    await joinGroup(locals.assessmentUrl, locals.joinCode);
  });

  step('assigns third user with required role upon join', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
    ];
    await verifyRoleAssignmentsInDatabase(expectedRoleUpdates, locals.assessment_id);
  });

  step('third user can start assessment as minimum roles are complete', function () {
    elemList = locals.$('#start-assessment');
    assert.isFalse(elemList.is(':disabled'));
  });

  step('does not enable the group role table as non-assigner', function () {
    elemList = locals.$('#role-select-form').find('input:not([disabled])');
    assert.lengthOf(elemList, 0);
  });

  step('displays no role assignment error', function () {
    elemList = locals.$('.alert:contains(needs to be assigned)');
    assert.lengthOf(elemList, 0);
  });

  step('first user can edit role table to make two users recorder', async function () {
    // Switch to first user
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);

    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
    ];
    await updateGroupRoles(
      locals.roleUpdates,
      locals.groupRoles,
      locals.studentUsers,
      locals.assessmentUrl,
    );
  });

  step('displays error for too few reflectors and too many recorders', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[2], locals.assessmentUrl, '00000003', 2);
    elemList = locals.$(
      '.alert:contains(more student needs to be assigned to the role "Reflector")',
    );
    assert.lengthOf(elemList, 1);
    elemList = locals.$(
      '.alert:contains(1 less student needs to be assigned to the role "Recorder")',
    );
    assert.lengthOf(elemList, 1);
  });

  step('cannot start assessment as minimum roles are incomplete', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('fourth user can load assessment and join group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[3], locals.assessmentUrl, '00000004', 2);
    await joinGroup(locals.assessmentUrl, locals.joinCode);
  });

  step('should not enable the group role table', function () {
    elemList = locals.$('#role-select-form').find('input:not([disabled])');
    assert.lengthOf(elemList, 0);
  });

  step('assigns fourth user with required role upon join', async function () {
    // Fourth user should receive required role because there is one role still to be assigned its minimum
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
    ];
    await verifyRoleAssignmentsInDatabase(expectedRoleUpdates, locals.assessment_id);
  });

  step('first user should see group role table with four users', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);

    elemList = locals.$('#role-select-form').find('tr');
    // Header row and four user rows
    assert.lengthOf(elemList, 5);
  });

  step(
    'first user can edit role table to correct role configuration and remove manager role',
    async function () {
      // Remove manager role to test whether it is correctly reassigned upon date
      locals.roleUpdates = [
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      locals.assignerRoleUpdate = {
        roleId: locals.manager.id,
        groupUserId: locals.studentUsers[0].user_id,
      };

      await updateGroupRoles(
        locals.roleUpdates,
        locals.groupRoles,
        locals.studentUsers,
        locals.assessmentUrl,
      );
    },
  );

  step('database contains correct role configuration after reassigning roles', async function () {
    // We expect the db to have all role updates, including the assigner role
    locals.roleUpdates = [...locals.roleUpdates, locals.assignerRoleUpdate];
    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
  });

  step('should have all four roles checked once in the table', async function () {
    // Reload assessment
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());

    verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
  });

  step('displays no errors when role config is correct', function () {
    elemList = locals.$('.alert:contains(needs to be assigned)');
    assert.lengthOf(elemList, 0);
  });

  step('should be able to start assessment when role config is correct', function () {
    elemList = locals.$('#start-assessment');
    assert.isFalse(elemList.is(':disabled'));
  });

  step('should be able to select the contributor role', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
    assert.lengthOf(elemList, 0);
  });

  step('first user can assign too many recorders', async function () {
    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
    ];
    await updateGroupRoles(
      locals.roleUpdates,
      locals.groupRoles,
      locals.studentUsers,
      locals.assessmentUrl,
    );
  });

  step(
    'should have correct role configuration in the database after assigning two recorders',
    async function () {
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
    },
  );

  step('should have correct roles checked in the table', async function () {
    // Reload assessment
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());

    verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
  });

  step('displays error for too many recorders', function () {
    elemList = locals.$(
      '.alert:contains(1 less student needs to be assigned to the role "Recorder")',
    );
    assert.lengthOf(elemList, 1);
  });

  step('first user can update roles to have two contributors', async function () {
    locals.roleUpdates = [
      // First user has both manager and contributor
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.contributor.id, groupUserId: locals.studentUsers[0].user_id },

      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
    ];
    await updateGroupRoles(
      locals.roleUpdates,
      locals.groupRoles,
      locals.studentUsers,
      locals.assessmentUrl,
    );
  });

  step('should have correct role configuration in the database', async function () {
    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
  });

  step('should have correct roles checked in the table', async function () {
    // Reload assessment
    const res = await fetch(locals.assessmentUrl);
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());

    verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
  });

  step('displays error for a student having too many roles', function () {
    elemList = locals.$('.alert:contains(too many roles)');
    assert.lengthOf(elemList, 1);
  });

  step('should not be able to start assessment with unbalanced role config', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('fourth user can leave group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[3], locals.assessmentUrl, '00000004', 2);
    await leaveGroup(locals.assessmentUrl);
  });

  step(
    'should remove non-required roles when group size does not exceed minimum required role assignments',
    async function () {
      // First user has no contributor role now that group size = # of required roles
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      ];
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
    },
  );

  step('first user should see correct roles checked in the table', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);
    verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
  });

  step('should assign fourth user as non-required role after rejoining', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[3], locals.assessmentUrl, '00000004', 2);
    await joinGroup(locals.assessmentUrl, locals.joinCode);

    // Fourth user receives contributor
    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
    ];
    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
  });

  step('first user should see correct roles checked in the table', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);
    verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
  });

  step(
    'should assign fifth user as non-required role when group size exceeds minimum required role assignments',
    async function () {
      // Switch to fifth user and join group
      await switchUserAndLoadAssessment(
        locals.studentUsers[4],
        locals.assessmentUrl,
        '00000005',
        2,
      );
      await joinGroup(locals.assessmentUrl, locals.joinCode);

      // Fifth user should have contributor role
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[4].user_id },
      ];
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
    },
  );

  step('first user should see five roles checked in the table', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 3);
    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
  });

  step(
    'first user can swap recorder and contributor roles between second and fifth user',
    async function () {
      locals.roleUpdates = [
        // Second user has contributor, fifth user has recorder
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[3].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[4].user_id },
      ];

      // Perform update and verify in database
      await updateGroupRoles(
        locals.roleUpdates,
        locals.groupRoles,
        locals.studentUsers,
        locals.assessmentUrl,
      );
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);

      // Reload assessment and verify in group role table
      const res = await fetch(locals.assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());

      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    },
  );

  step(
    'should replace non-required role with required role of leaving user when group is big enough',
    async function () {
      // Switch to fifth user and leave
      await switchUserAndLoadAssessment(
        locals.studentUsers[4],
        locals.assessmentUrl,
        '00000005',
        2,
      );
      await leaveGroup(locals.assessmentUrl);

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
        (row) => row.user_id === locals.studentUsers[1].user_id,
      );
      assert.isTrue(secondUserRoles.length === 1);

      const secondUserRole = secondUserRoles[0];
      assert.isTrue(
        secondUserRole.group_role_id === locals.recorder.id ||
          secondUserRole.group_role_id === locals.contributor.id,
      );

      const roleUpdates = secondUserRole.id === locals.recorder.id ? roleUpdates1 : roleUpdates2;
      const expected = roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));

      assert.sameDeepMembers(expected, result.rows);
      locals.roleUpdates = roleUpdates;
    },
  );

  step(
    'correct roles are checked in group role table after required roles are transferred',
    async function () {
      // Switch to assigner
      await switchUserAndLoadAssessment(
        locals.studentUsers[0],
        locals.assessmentUrl,
        '00000001',
        3,
      );

      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    },
  );

  step(
    'first user can swap reflector and contributor roles between third and fourth user',
    async function () {
      locals.roleUpdates = [
        // Third user has contributor, fourth user has reflector
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      // Perform update and verify in database
      await updateGroupRoles(
        locals.roleUpdates,
        locals.groupRoles,
        locals.studentUsers,
        locals.assessmentUrl,
      );
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);

      // Reload assessment and verify update in role table
      const res = await fetch(locals.assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());

      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    },
  );

  step('should be able to switch to fourth user and leave group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[3], locals.assessmentUrl, '00000004', 2);
    await leaveGroup(locals.assessmentUrl);
  });

  step(
    'should replace non-required role with required role of leaving user when group meets minimum required role assignments',
    async function () {
      // Fourth user's contributor role should replace third user's contributor role
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      ];
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);

      // Switch to first user and verify roles updated correctly in UI
      await switchUserAndLoadAssessment(
        locals.studentUsers[0],
        locals.assessmentUrl,
        '00000001',
        3,
      );
      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    },
  );

  step('should be able to switch to fourth user and leave group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[2], locals.assessmentUrl, '00000003', 2);
    await leaveGroup(locals.assessmentUrl);
  });

  step(
    'required roles of leaving user are transferred when group size falls below minimum required role assignments',
    async function () {
      // Reflector role should be transferred after third user leaves. The role can either
      // fall to the first user or second user. We'll test for either case happening

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
      const result = await sqldb.queryAsync(sql.select_group_user_roles, {
        assessment_id: locals.assessment_id,
      });
      assert.lengthOf(result.rows, 3);

      // Get all roles for first user
      const firstUserRoleUpdates = result.rows.filter(
        (row) => row.user_id === locals.studentUsers[0].user_id,
      );
      assert.isTrue(firstUserRoleUpdates.length === 1 || firstUserRoleUpdates.length === 2);

      const roleUpdates = firstUserRoleUpdates.length === 2 ? roleUpdates1 : roleUpdates2;
      const expected = roleUpdates.map(({ roleId, groupUserId }) => ({
        user_id: groupUserId,
        group_role_id: roleId,
      }));

      assert.sameDeepMembers(expected, result.rows);
      locals.roleUpdates = roleUpdates;
    },
  );

  step(
    'group role table should have correct roles checked after roles transfer upon leave',
    async function () {
      await switchUserAndLoadAssessment(
        locals.studentUsers[0],
        locals.assessmentUrl,
        '00000001',
        3,
      );
      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    },
  );

  step('all required roles of a leaving user should be transferred if possible', async function () {
    // Leave group as first user
    await leaveGroup(locals.assessmentUrl);

    // Switch to second user
    await switchUserAndLoadAssessment(locals.studentUsers[1], locals.assessmentUrl, '00000002', 3);

    locals.roleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[1].user_id },
    ];

    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, locals.assessment_id);
  });

  step('group role table is visible and has one user with three roles', function () {
    elemList = locals.$('#role-select-form').find('tr');
    assert.lengthOf(elemList, 2);

    verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
  });

  step('first user can load assessment without roles', async function () {
    await switchUserAndLoadAssessment(
      locals.studentUsers[0],
      locals.assessmentUrlWithoutRoles,
      '00000001',
      2,
    );
  });

  step('first user can create a group in assessment without roles', async function () {
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

const changeGroupRolesConfig = async (courseDir: string, groupRoles: GroupRole[]) => {
  const infoAssessmentPath = path.join(
    courseDir,
    'courseInstances',
    'Sp15',
    'assessments',
    'hw5-templateGroupWork',
    'infoAssessment.json',
  );
  const infoAssessment = await fs.readJSON(infoAssessmentPath);
  infoAssessment.groupRoles = groupRoles;

  await fs.writeJSON(infoAssessmentPath, infoAssessment);
  await syncCourseData(courseDir);
};

describe('Test group role reassignments with role of minimum > 1', function () {
  let tempTestCourseDir: tmp.DirectoryResult;
  let assessmentId: string;
  let assessmentUrl;

  before('set authenticated user', function () {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });

  before('set up testing server', async function () {
    // Create a copy of the course that we can safely manipulate.
    tempTestCourseDir = await tmp.dir({ unsafeCleanup: true });
    await fs.copy(TEST_COURSE_PATH, tempTestCourseDir.path, {
      overwrite: true,
    });

    await helperServer.before(tempTestCourseDir.path).call(this);

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
    await helperServer.after.call(this);
  });

  after('unset authenticated user', function () {
    Object.assign(config, storedConfig);
  });

  step('change group config to include a role with minimum of two', async function () {
    const groupRoles = [
      { name: 'Manager', minimum: 1, maximum: 1, canAssignRoles: true },
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
    await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 2);
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
    await verifyRoleAssignmentsInDatabase(locals.roleUpdates, assessmentId);
  });

  step('second user should be able to join group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[1], assessmentUrl, '00000002', 2);
    await joinGroup(assessmentUrl, locals.joinCode);
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
    await verifyRoleAssignmentsInDatabase(expectedRoleUpdates, assessmentId);
  });

  step('should not enable the group role table for non-assigner', function () {
    elemList = locals.$('#role-select-form').find('input:not([disabled])');
    assert.lengthOf(elemList, 0);
  });

  step('should display correct errors for too few role assignments', function () {
    elemList = locals.$(
      '.alert:contains(1 more student needs to be assigned to the role "Reflector")',
    );
    assert.lengthOf(elemList, 1);
    elemList = locals.$(
      '.alert:contains(1 more student needs to be assigned to the role "Recorder")',
    );
    assert.lengthOf(elemList, 1);
  });

  step('third user should be able to join group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[2], assessmentUrl, '00000003', 2);
    await joinGroup(assessmentUrl, locals.joinCode);
  });

  step('database assigns third user with required role', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
    ];
    await verifyRoleAssignmentsInDatabase(expectedRoleUpdates, assessmentId);
  });

  step('should not be able to start assessment as non-assigner', function () {
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));
  });

  step('should not enable the group role table for non-assigner', function () {
    elemList = locals.$('#role-select-form').find('input:not([disabled])');
    assert.lengthOf(elemList, 0);
  });

  step('displays error for too few recorders', function () {
    elemList = locals.$(
      '.alert:contains(1 more student needs to be assigned to the role "Recorder")',
    );
    assert.lengthOf(elemList, 1);
  });

  step('displays no errors for reflector', function () {
    elemList = locals.$('.alert:contains(Reflector)');
    assert.lengthOf(elemList, 0);
  });

  step('first user can see group role table with four users', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 3);

    elemList = locals.$('#role-select-form').find('tr');
    // Header row and three user rows
    assert.lengthOf(elemList, 4);
  });

  step('first user should not be able to select the contributor role', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
    assert.lengthOf(elemList, 1);
    elemList = elemList.parent('label');
    assert.equal(elemList.text().trim(), locals.contributor.role_name);
  });

  step('fourth user should be able to join group', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[3], assessmentUrl, '00000004', 2);
    await joinGroup(assessmentUrl, locals.joinCode);
  });

  step('assigns fourth user with required role upon join', async function () {
    const expectedRoleUpdates = [
      { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
      { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      { roleId: locals.recorder.id, groupUserId: locals.studentUsers[3].user_id },
    ];
    await verifyRoleAssignmentsInDatabase(expectedRoleUpdates, assessmentId);
  });

  step('should be able to start assessment', function () {
    elemList = locals.$('#start-assessment');
    assert.isFalse(elemList.is(':disabled'));
  });

  step('displays no role assignment errors', function () {
    elemList = locals.$('.alert:contains(needs to be assigned)');
    assert.lengthOf(elemList, 0);
  });

  step('should not enable the group role table for non-assigner', function () {
    elemList = locals.$('#role-select-form').find('input:not([disabled])');
    assert.lengthOf(elemList, 0);
  });

  step('first user can see group role table with four users', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 3);

    elemList = locals.$('#role-select-form').find('tr');
    // Header row and four user rows
    assert.lengthOf(elemList, 5);
  });

  step('first user should not be able to select the contributor role', function () {
    elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
    assert.lengthOf(elemList, 1);
    elemList = elemList.parent('label');
    assert.equal(elemList.text().trim(), locals.contributor.role_name);
  });

  describe('test correct role config where group size matches minimum required role count', function () {
    step(
      'first user can update roles with correct role configuration without manager',
      async function () {
        // First user keeps manager unchecked, since we expect the role to be automatically assigned
        locals.roleUpdates = [
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
          { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
        ];

        locals.assignerRoleUpdate = {
          roleId: locals.manager.id,
          groupUserId: locals.studentUsers[0].user_id,
        };

        await updateGroupRoles(
          locals.roleUpdates,
          locals.groupRoles,
          locals.studentUsers,
          assessmentUrl,
        );
      },
    );

    step(
      'contains correct role configuration with manager role after reassigning',
      async function () {
        // We expect the db to have all role updates, including the assigner role
        locals.roleUpdates = [...locals.roleUpdates, locals.assignerRoleUpdate];
        await verifyRoleAssignmentsInDatabase(locals.roleUpdates, assessmentId);

        // Reload assessment page
        const res = await fetch(assessmentUrl);
        assert.isOk(res.ok);
        locals.$ = cheerio.load(await res.text());

        // Group role table should also have all role updates plus assigner role
        verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
      },
    );

    step('should have no errors displayed', function () {
      elemList = locals.$('.alert:contains(to be assigned)');
      assert.lengthOf(elemList, 0);
      elemList = locals.$(
        '.alert:contains(At least one user does not have a role. All users must have a role.)',
      );
      assert.lengthOf(elemList, 0);
    });

    step('first user should not be able to select the contributor role', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
      assert.lengthOf(elemList, 1);
      elemList = elemList.parent('label');
      assert.equal(elemList.text().trim(), locals.contributor.role_name);
    });

    step('should be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isFalse(elemList.is(':disabled'));
    });
  });

  describe('test correct role config where group size exceeds minimum required role count', function () {
    step('assigns fifth user with non-required role after join', async function () {
      // Switch to fifth user and join group
      await switchUserAndLoadAssessment(locals.studentUsers[4], assessmentUrl, '00000005', 2);
      await joinGroup(assessmentUrl, locals.joinCode);

      // Fifth user should have contributor role
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[4].user_id },
      ];
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, assessmentId);
    });

    step('switch back to first user and load group role table', async function () {
      await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 3);
    });

    step('group role table is visible and has five users with correct roles', function () {
      elemList = locals.$('#role-select-form').find('tr');
      // Header row and five user rows
      assert.lengthOf(elemList, 6);

      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    });

    step('should have no errors displayed', function () {
      elemList = locals.$('.alert:contains(to be assigned)');
      assert.lengthOf(elemList, 0);
      elemList = locals.$(
        '.alert:contains(At least one user does not have a role. All users must have a role.)',
      );
      assert.lengthOf(elemList, 0);
    });

    step('first user should be able to select the contributor role', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
      assert.lengthOf(elemList, 0);
    });

    step('should be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isFalse(elemList.is(':disabled'));
    });
  });

  describe('test incorrect role config where group size exceeds minimum required role count', function () {
    step('first user should be able to add extra contributor', async function () {
      // Third user receives contributor
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
        { roleId: locals.contributor.id, groupUserId: locals.studentUsers[4].user_id },
      ];
      await updateGroupRoles(
        locals.roleUpdates,
        locals.groupRoles,
        locals.studentUsers,
        assessmentUrl,
      );

      // Verify update in database
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, assessmentId);

      // Reload and verify update in UI
      const res = await fetch(assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    });

    step('should have correct errors displayed', function () {
      elemList = locals.$('.alert:contains(student has too many roles)');
      assert.lengthOf(elemList, 1);
    });

    step('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });

    step('should be able to leave as fifth user', async function () {
      // Switch to fifth user
      await switchUserAndLoadAssessment(locals.studentUsers[4], assessmentUrl, '00000005', 2);

      // Leave as fifth user
      await leaveGroup(assessmentUrl);
    });
  });

  describe('test incorrect role config where user has no roles', function () {
    step('first user can remove a recorder assignment', async function () {
      // Switch to first user and load assessment
      await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 3);

      // Remove recorder assignment from second user
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[2].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[3].user_id },
      ];

      await updateGroupRoles(
        locals.roleUpdates,
        locals.groupRoles,
        locals.studentUsers,
        assessmentUrl,
      );

      // Verify update in database
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, assessmentId);

      // Reload assessment and verify updates in group role table
      const res = await fetch(assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    });

    step('should have correct errors displayed', function () {
      elemList = locals.$(
        '.alert:contains(1 more student needs to be assigned to the role "Recorder" (Found 1, expected exactly 2).)',
      );
      assert.lengthOf(elemList, 0);
      elemList = locals.$(
        '.alert:contains(At least one user does not have a role. All users must have a role.)',
      );
      assert.lengthOf(elemList, 1);
    });

    step('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
  });

  describe('test incorrect role config where roles are unbalanced', function () {
    step('first user can add too many roles to assigner', async function () {
      // Give first user both manager and recorder
      // Leave fourth user without a role
      locals.roleUpdates = [
        { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[0].user_id },
        { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
        { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
      ];

      // Verify update in database
      await updateGroupRoles(
        locals.roleUpdates,
        locals.groupRoles,
        locals.studentUsers,
        assessmentUrl,
      );

      // Verify in database
      await verifyRoleAssignmentsInDatabase(locals.roleUpdates, assessmentId);

      // Reload assessment page and verify update in UI
      const res = await fetch(assessmentUrl);
      assert.isOk(res.ok);
      locals.$ = cheerio.load(await res.text());
      verifyRoleAssignmentsInRoleTable(locals.roleUpdates);
    });

    step('should have correct errors displayed', function () {
      elemList = locals.$('.alert:contains(to be assigned to the role "Recorder")');
      assert.lengthOf(elemList, 0);

      elemList = locals.$(
        '.alert:contains(At least one user does not have a role. All users must have a role.)',
      );
      assert.lengthOf(elemList, 1);

      elemList = locals.$('.alert:contains(student has too many roles)');
      assert.lengthOf(elemList, 1);
    });

    step('should not be able to start assessment', function () {
      elemList = locals.$('#start-assessment');
      assert.isTrue(elemList.is(':disabled'));
    });
  });

  describe('test correct role config where group size falls below minimum required role count', function () {
    step('should be able to leave as fourth user', async function () {
      await switchUserAndLoadAssessment(locals.studentUsers[3], assessmentUrl, '00000004', 2);

      // Leave as fourth user
      await leaveGroup(assessmentUrl);
    });

    step(
      'should have correct role configuration in the database after fourth user leaves',
      async function () {
        locals.roleUpdates = [
          { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[0].user_id },
          { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
          { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        ];
        await verifyRoleAssignmentsInDatabase(locals.roleUpdates, assessmentId);
      },
    );

    step('first user sees group role table with three users', async function () {
      await switchUserAndLoadAssessment(locals.studentUsers[0], assessmentUrl, '00000001', 3);
      elemList = locals.$('#role-select-form').find('tr');
      // Header row and two user rows
      assert.lengthOf(elemList, 4);
    });

    step('first user should not be able to select the contributor role', function () {
      elemList = locals.$('#role-select-form').find('tr').eq(1).find('input:disabled');
      assert.lengthOf(elemList, 1);
      elemList = elemList.parent('label');
      assert.equal(elemList.text().trim(), locals.contributor.role_name);
    });

    step('should be able to leave as first user', async function () {
      await leaveGroup(assessmentUrl);
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
          1,
        );
        assert.lengthOf(
          result.rows.filter(({ group_role_id }) => group_role_id === locals.recorder.id),
          2,
        );
        assert.lengthOf(
          result.rows.filter(({ group_role_id }) => group_role_id === locals.reflector.id),
          1,
        );
        assert.lengthOf(
          result.rows.filter(({ group_role_id }) => group_role_id === locals.contributor.id),
          0,
        );
      },
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
        locals.studentUsers[1].user_id,
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
    },
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
        locals.studentUsers[0].user_id,
      );
      // Manager role should replace first user's contributor role
      const expected = [
        {
          user_id: locals.studentUsers[1].user_id,
          group_role_id: locals.manager.id,
        },
      ];
      assert.sameDeepMembers(result, expected);
    },
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
        locals.studentUsers[0].user_id,
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
        ({ user_id }) => user_id === locals.studentUsers[1].user_id,
      );
      assert.isDefined(secondUserRoleAssignment);
      const expected =
        secondUserRoleAssignment?.group_role_id === locals.manager.id ? expected1 : expected2;
      assert.sameDeepMembers(result, expected);
    },
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
        locals.studentUsers[0].user_id,
      );

      // Ensure that there is a single role assignment for manager, recorder, and reflector each
      assert.lengthOf(
        result.filter(({ group_role_id }) => group_role_id === locals.manager.id),
        1,
      );
      assert.lengthOf(
        result.filter(({ group_role_id }) => group_role_id === locals.recorder.id),
        1,
      );
      assert.lengthOf(
        result.filter(({ group_role_id }) => group_role_id === locals.reflector.id),
        1,
      );

      // Ensure that there are no contributors
      assert.lengthOf(
        result.filter(({ group_role_id }) => group_role_id === locals.contributor.id),
        0,
      );
    },
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
      locals.studentUsers[1].user_id,
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
      locals.studentUsers[1].user_id,
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
