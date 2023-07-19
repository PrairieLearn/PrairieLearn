const { config } = require('../lib/config');
const assert = require('chai').assert;
const cheerio = require('cheerio');
const fetch = require('node-fetch').default;
const { step } = require('mocha-steps');

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const { idsEqual } = require('../lib/id');
const { TEST_COURSE_PATH } = require('../lib/paths');

let page, elemList;
const locals = {};
locals.helperClient = require('./helperClient');
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';

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
  const page = await res.text();
  locals.$ = cheerio.load(page);

  // Check for CSRF tokens
  elemList = locals.$('form input[name="__csrf_token"]');
  assert.lengthOf(elemList, numCsrfTokens);
  assert.nestedProperty(elemList[0], 'attribs.value');
  locals.__csrf_token = elemList[0].attribs.value;
  assert.isString(locals.__csrf_token);
};

const createGroup = async (groupName, csrfToken, assessmentUrl) => {
  const form = {
    __action: 'create_group',
    __csrf_token: csrfToken,
    groupName: groupName,
  };
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams(form),
  });
  assert.isOk(res.ok);
  locals.$ = cheerio.load(await res.text());
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

describe('Group based exam assess control on student side', function () {
  this.timeout(20000);
  before('set authenticated user', function (callback) {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    callback(null);
  });
  before('set up testing server', helperServer.before(TEST_COURSE_PATH));
  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function (callback) {
    Object.assign(config, storedConfig);
    callback(null);
  });

  step('1. the database contains a group-based exam assessment', async function () {
    const result = await sqldb.queryAsync(sql.select_group_work_exam_assessment, []);
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
  });

  step(
    '2. GET to instructor assessments URL group tab for the first assessment loads correctly',
    async function () {
      // should load successfully
      const res = await fetch(locals.instructorAssessmentsUrlGroupTab);
      page = await res.text();

      // should parse
      locals.$ = cheerio.load(page);

      // check for CSRF tokens
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 5);
      // there are 6 occurrences of the same csrf, we will pick the first one
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    },
  );

  step('3. Group config in database is correct', async function () {
    const params = {
      assessment_id: locals.assessment_id,
    };
    const result = await sqldb.queryOneRowAsync(sql.select_group_config, params);
    const min = result.rows[0]['minimum'];
    const max = result.rows[0]['maximum'];
    assert.equal(min, 2);
    assert.equal(max, 2);
  });

  step('4. get 5 student user', async function () {
    // generate 5 users in database
    const result = await sqldb.queryAsync(sql.generate_and_enroll_5_users, []);
    assert.lengthOf(result.rows, 5);
    locals.studentUsers = result.rows.slice(0, 3);
    locals.studentUserNotGrouped = result.rows[3];
    locals.studentUserInDiffGroup = result.rows[4];
    locals.groupCreator = locals.studentUsers[0];
    assert.lengthOf(locals.studentUsers, 3);

    // switch to first user
    config.authUid = locals.groupCreator.uid;
    config.authName = locals.groupCreator.name;
    config.authUin = '00000001';
  });

  step('5. POST request to exam page creates group correctly', async function () {
    // switch to user
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 2);

    // create group and load page as first user
    locals.group_name = 'groupBB';
    await createGroup(locals.group_name, locals.__csrf_token, locals.assessmentUrl);
  });

  step('6. the group information after 1 user join the group should be correct', function () {
    // should contain the correct group name
    elemList = locals.$('#group-name');
    assert.equal(elemList.text(), locals.group_name);

    // should contain the 4-character join code
    elemList = locals.$('#join-code');
    locals.joinCode = elemList.text();
    assert.lengthOf(locals.joinCode, locals.$('#group-name').text().length + 1 + 4);

    // should not be able to start assessment
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));

    // should be missing 1 more group member to start
    elemList = locals.$('.text-center:contains(1 more)');
    assert.lengthOf(elemList, 1);
  });

  step('7. the second user can join the group using code', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[1], locals.assessmentUrl, '00000002', 2);
    await joinGroup(locals.assessmentUrl, locals.joinCode);
  });

  step('8. the group information after 2 users join the group', function () {
    // should contain the correct group name
    elemList = locals.$('#group-name');
    assert.equal(elemList.text(), locals.group_name);

    // should contain the 4-character join code
    elemList = locals.$('#join-code');
    assert.equal(locals.joinCode, elemList.text());

    // should not be able to start assessment
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));

    // should be missing no more group members to start
    elemList = locals.$('.text-center:contains(1 more)');
    assert.lengthOf(elemList, 0);
  });

  step('9. the third user can not join the already full group', async function () {
    // join as ungrouped user
    await switchUserAndLoadAssessment(
      locals.studentUserNotGrouped,
      locals.assessmentUrl,
      '00000004',
      2,
    );

    // send request to join group
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    locals.$ = cheerio.load(await res.text());

    // alert should show that group is already full
    elemList = locals.$('.alert:contains(It is already full)');
    assert.lengthOf(elemList, 1);
  });

  step('10. start assessment as the second user successfully', async function () {
    await switchUserAndLoadAssessment(locals.studentUsers[1], locals.assessmentUrl, '00000002', 2);

    // should have two rows under group members list
    elemList = locals.$('.col-sm li');
    assert.lengthOf(elemList, 2);

    // check the honor code is unchecked first and assessment cannot be started
    assert.isNotTrue(locals.$('#certify-pledge').prop('checked'));
    elemList = locals.$('#start-assessment');
    assert.isTrue(elemList.is(':disabled'));

    // check the class honor code before starting the assessment
    locals.$('#certify-pledge').attr('checked', '');
    elemList = locals.$('#certify-pledge').find('input:checked');
    assert.isTrue(locals.$('#certify-pledge').prop('checked'));

    // should have a non-disabled "start assessment" button
    elemList = locals.$('#start-assessment');
    locals.$('#start-assessment').attr('disabled', null);
    assert.isNotTrue(elemList.is(':disabled'));

    // should have no assessment instances in database
    const result = await sqldb.queryAsync(sql.select_all_assessment_instance, []);
    assert.lengthOf(result.rows, 0);

    // start assessment
    const form = {
      __action: 'new_instance',
      __csrf_token: locals.__csrf_token,
    };
    const response = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
      follow: true,
    });
    assert.isOk(response.ok);
    locals.$ = cheerio.load(await response.text());

    // check there is now one assessment instance in database
    const res = await sqldb.queryAsync(sql.select_all_assessment_instance, []);
    assert.lengthOf(res.rows, 1);
    locals.assessment_instance_id = res.rows[0].id;
    locals.assessmentInstanceURL =
      locals.courseInstanceUrl + '/assessment_instance/' + locals.assessment_instance_id;
    assert.equal(res.rows[0].group_id, 1);
  });

  step('11. check access control of all users of group 1 is correct', async function () {
    // access assessment instance 1 as first user
    await switchUserAndLoadAssessment(locals.studentUsers[0], locals.assessmentUrl, '00000001', 5);
    const firstMemberResponse = await fetch(locals.assessmentInstanceURL);
    assert.isOk(firstMemberResponse.ok);
    locals.$ = cheerio.load(await firstMemberResponse.text());

    await switchUserAndLoadAssessment(locals.studentUsers[1], locals.assessmentUrl, '00000002', 5);
    const secondMemberResponse = await fetch(locals.assessmentInstanceURL);
    assert.isOk(secondMemberResponse.ok);
    locals.$ = cheerio.load(await secondMemberResponse.text());
  });

  step(
    '12. access control of student who used to be in group 1 but not in any group now',
    async function () {
      // leaving exam group as second user should be successful
      const form = {
        __action: 'leave_group',
        __csrf_token: locals.__csrf_token,
      };
      const leaveResponse = await fetch(locals.assessmentInstanceURL, {
        method: 'POST',
        body: new URLSearchParams(form),
      });
      assert.isOk(leaveResponse.ok);
      locals.$ = cheerio.load(await leaveResponse.text());

      // attempt to access exam assessment instance should be unsuccessful
      const accessResponse = await fetch(locals.assessmentInstanceURL);
      assert.equal(accessResponse.status, 403, 'status should be forbidden');
    },
  );

  step(
    '13. access control of student who used to be in group 1 but in a different group now',
    async function () {
      // should have the correct number of CSRF tokens
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 2);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);

      // create an entirely new group
      locals.group_name_alternative1 = 'groupCC';
      await createGroup(locals.group_name_alternative1, locals.__csrf_token, locals.assessmentUrl);

      // attempt to access previous exam assessment instance should be unsuccessful
      const accessResponse = await fetch(locals.assessmentInstanceURL);
      assert.equal(accessResponse.status, 403, 'status should be forbidden');
    },
  );

  step('14. access control of student who are not in any group', async function () {
    const student = locals.studentUserNotGrouped;
    config.authUid = student.uid;
    config.authName = student.name;
    config.authUin = '00000004';

    const accessResponse = await fetch(locals.assessmentInstanceURL);
    assert.equal(accessResponse.status, 403, 'status should be forbidden');
  });

  step('15. access control of student who are in a different group', async function () {
    // switch to user not in a group and create a new, different group
    await switchUserAndLoadAssessment(
      locals.studentUserInDiffGroup,
      locals.assessmentUrl,
      '00000005',
      2,
    );
    locals.group_name_alternative2 = 'groupBBCC';
    await createGroup(locals.group_name_alternative2, locals.__csrf_token, locals.assessmentUrl);

    // should NOT be able to access the assessment instance 1 as a student from a different group
    const accessResponse = await fetch(locals.assessmentInstanceURL);
    assert.equal(accessResponse.status, 403, 'status should be forbidden');
  });

  step('16. cross assessment grouping is disallowed', async function () {
    // ensure there is a second group exam assessment
    const result = await sqldb.queryAsync(sql.select_group_work_exam_assessment, []);
    assert.lengthOf(result.rows, 2);
    assert.notEqual(result.rows[1].id, undefined);

    // load the second assessment
    let res = await fetch(locals.assessmentUrl_2);
    assert.isOk(res.ok);
    const page = await res.text();
    locals.$ = cheerio.load(page);

    // check for 2 CSRF tokens
    elemList = locals.$('form input[name="__csrf_token"]');
    assert.lengthOf(elemList, 2);
    assert.nestedProperty(elemList[0], 'attribs.value');
    locals.__csrf_token = elemList[0].attribs.value;
    assert.isString(locals.__csrf_token);

    // attempt to join group in second assessment using join code from first assessment
    const form = {
      __action: 'join_group',
      __csrf_token: locals.__csrf_token,
      join_code: locals.joinCode,
    };
    res = await fetch(locals.assessmentUrl_2, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    locals.$ = cheerio.load(await res.text());

    // check that error message is shown
    elemList = locals.$('.alert:contains(It is already full)');
    assert.lengthOf(elemList, 1);
  });
});
