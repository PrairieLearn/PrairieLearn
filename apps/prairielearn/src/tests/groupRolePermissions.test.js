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
const { TEST_COURSE_PATH } = require('../lib/paths');

let elemList;
const locals = {};
locals.helperClient = require('./helperClient');
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';
locals.courseDir = TEST_COURSE_PATH;

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

    // Mark the checkboxes as checked
    roleUpdates.forEach(({ roleId, groupUserId }) => {
        locals.$(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
    });
    elemList = locals.$('#role-select-form').find('tr').find('input:checked');
    // console.log(elemList);
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
};

describe('Test group role functionality within assessments', function () {
    this.timeout(20000);

    before('set authenticated user', function () {
        storedConfig.authUid = config.authUid;
        storedConfig.authName = config.authName;
        storedConfig.authUin = config.authUin;
    });

    before('set up testing server', async function () {
        await util.promisify(helperServer.before(locals.courseDir).bind(this))();

        // Find the ID of an assessment that has group roles
        const assessmentResults = await sqldb.queryOneRowAsync(sql.select_assessment, {
            tid: 'hw5-templateGroupWork',
        });
        locals.assessmentId = assessmentResults.rows[0].id;
        locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessmentId;
    });

    after('shut down testing server', helperServer.after);

    after('unset authenticated user', function () {
        Object.assign(config, storedConfig);
    });

    step('can insert/get 3 users into/from the DB', async function () {
        const result = await sqldb.queryAsync(sql.generate_and_enroll_3_users, []);
        assert.lengthOf(result.rows, 3);
        locals.studentUsers = result.rows;
    });

    step('contains the 4 group roles for the assessment', async function () {
        const params = {
            assessment_id: locals.assessmentId,
        };
        const result = await sqldb.queryAsync(sql.select_assessment_group_roles, params);
        assert.lengthOf(result.rows, 4);
        locals.groupRoles = result.rows;

        locals.manager = result.rows.find((row) => row.role_name === 'Manager');;
        locals.recorder = result.rows.find((row) => row.role_name === 'Recorder');;
        locals.reflector = result.rows.find((row) => row.role_name === 'Reflector');;
        locals.contributor = result.rows.find((row) => row.role_name === 'Contributor');;
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
        locals.joinCode = locals.$('#join-code').text();
    });

    step('can join group as second and third users', async function () {
        await switchUserAndLoadAssessment(locals.studentUsers[1], locals.assessmentUrl, '00000002', 2);
        await joinGroup(locals.assessmentUrl, locals.joinCode);
        await switchUserAndLoadAssessment(locals.studentUsers[2], locals.assessmentUrl, '00000003', 2);
        await joinGroup(locals.assessmentUrl, locals.joinCode);
    });

    step('can assign group roles as first user', async function () {
        await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 2);
        locals.roleUpdates = [
            { roleId: locals.manager.id, groupUserId: locals.studentUsers[0].user_id },
            { roleId: locals.recorder.id, groupUserId: locals.studentUsers[1].user_id },
            { roleId: locals.reflector.id, groupUserId: locals.studentUsers[2].user_id },
        ];
        await updateGroupRoles(
            locals.roleUpdates,
            locals.groupRoles,
            locals.studentUsers,
            locals.assessmentUrl
        );
    });

    step('can start asssesment', async function () {
        var form = {
            __action: 'new_instance',
            __csrf_token: locals.__csrf_token,
        };
        const res = await fetch(locals.assessmentUrl, {
            method: 'POST',
            body: new URLSearchParams(form),
        });
        assert.isOk(res.ok);
        locals.$ = cheerio.load(await res.text());
    });
});