const { config } = require('../lib/config');
const assert = require('chai').assert;
const cheerio = require('cheerio');
const fetch = require('node-fetch').default;
const { step } = require('mocha-steps');

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
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
    assert.lengthOf(result.rows, 1);
    assert.notEqual(result.rows[0].id, undefined);
    locals.assessment_id = result.rows[0].id;
    locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessment_id;
    locals.instructorAssessmentsUrlGroupTab =
      locals.courseInstanceUrl + '/instructor/assessment/' + locals.assessment_id + '/groups';
  });

  step('2. GET to instructor assessments URL group tab for the first assessment loads correctly', async function () {
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
  });

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

    // create group
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
    await switchUserAndLoadAssessment(locals.studentUserNotGrouped, locals.assessmentUrl, '00000004', 2);

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

    // TODO: check the class honor code before starting the assessment

    // should have a non-disabled "start assessment" button
    elemList = locals.$('#start-assessment');
    assert.isNotTrue(elemList.is(':disabled'));

    // should have three rows under group members list
    elemList = locals.$('.col-sm li');
    assert.lengthOf(elemList, 2);

    // should have no assessment instances in database
    const result = await sqldb.queryAsync(sql.select_all_assessment_instance, []);
    assert.lengthOf(result.rows, 0);

    // start assessment
    const form = {
      __action: 'new_instance',
      __csrf_token: locals.__csrf_token,
    };
    const res = await fetch(locals.assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams(form),
      follow: true,
    });
    assert.isOk(res.ok);
    locals.$ = cheerio.load(await res.text());
    // it('should have 1 assessment instance in db', function (callback) {
    //   sqldb.query(sql.select_all_assessment_instance, [], function (err, result) {
    //     if (ERR(err, callback)) return;
    //     assert.lengthOf(result.rows, 1);
    //     locals.assessment_instance_id = result.rows[0].id;
    //     locals.assessmentInstanceURL =
    //       locals.courseInstanceUrl + '/assessment_instance/' + locals.assessment_instance_id;
    //     assert.equal(result.rows[0].group_id, 1);
    //     callback(null);
    //   });
    // });
  });

  //   describe('15. access control of all members of group 1', function () {
  //     it('should be able to access the assessment instance 1 as the 1st group member', function (callback) {
  //       request(locals.assessmentInstanceURL, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 200) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //     it('should parse', function () {
  //       locals.$ = cheerio.load(page);
  //     });
  //     it('should be able to switch to 2nd group member', function (callback) {
  //       var student = locals.studentUsers[1];
  //       config.authUid = student.uid;
  //       config.authName = student.name;
  //       config.authUin = '00000002';
  //       callback(null);
  //     });
  //     it('should be able to access the assessment instance 1 as the 2nd group member', function (callback) {
  //       request(locals.assessmentInstanceURL, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 200) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //     it('should parse', function () {
  //       locals.$ = cheerio.load(page);
  //     });
  //     it('should be able to switch to 3rd group member', function (callback) {
  //       var student = locals.studentUsers[0];
  //       config.authUid = student.uid;
  //       config.authName = student.name;
  //       config.authUin = '00000001';
  //       callback(null);
  //     });
  //     it('should be able to access the assessment instance 1 as the 3rd group member', function (callback) {
  //       request(locals.assessmentInstanceURL, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 200) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //     it('should parse', function () {
  //       locals.$ = cheerio.load(page);
  //     });
  //   });

  //   describe('16. access control of student who used to be in group 1 but not in any group now', function () {
  //     it('should have a CSRF token', function () {
  //       elemList = locals.$('form input[name="__csrf_token"]');
  //       assert.lengthOf(elemList, 3);
  //       assert.nestedProperty(elemList[0], 'attribs.value');
  //       locals.__csrf_token = elemList[0].attribs.value;
  //       assert.isString(locals.__csrf_token);
  //     });
  //     it('should be able to Leave the group', function (callback) {
  //       var form = {
  //         __action: 'leave_group',
  //         __csrf_token: locals.__csrf_token,
  //       };
  //       request.post(
  //         {
  //           url: locals.assessmentInstanceURL,
  //           form: form,
  //           followAllRedirects: true,
  //         },
  //         function (error, response, body) {
  //           if (ERR(error, callback)) return;
  //           if (response.statusCode !== 200) {
  //             return callback(new Error('bad status: ' + response.statusCode));
  //           }
  //           page = body;
  //           callback(null);
  //         }
  //       );
  //     });
  //     it('should parse', function () {
  //       locals.$ = cheerio.load(page);
  //     });
  //     it('should NOT be able to access the assessment instance 1 as a ungrouped student', function (callback) {
  //       request(locals.assessmentInstanceURL, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 403) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //   });
  //   describe('17. access control of student who used to be in group 1 but in a different group now', function () {
  //     it('should have a CSRF token', function () {
  //       elemList = locals.$('form input[name="__csrf_token"]');
  //       assert.lengthOf(elemList, 2);
  //       assert.nestedProperty(elemList[0], 'attribs.value');
  //       locals.__csrf_token = elemList[0].attribs.value;
  //       assert.isString(locals.__csrf_token);
  //     });
  //     it('should be able to create a group', function (callback) {
  //       locals.group_name_alternative1 = 'groupCC';
  //       var form = {
  //         __action: 'create_group',
  //         __csrf_token: locals.__csrf_token,
  //         groupName: locals.group_name_alternative1,
  //       };
  //       request.post(
  //         { url: locals.assessmentUrl, form: form, followAllRedirects: true },
  //         function (error, response, body) {
  //           if (ERR(error, callback)) return;
  //           if (response.statusCode !== 200) {
  //             return callback(new Error('bad status: ' + response.statusCode));
  //           }
  //           page = body;
  //           callback(null);
  //         }
  //       );
  //     });
  //     it('should NOT be able to access the assessment instance 1 as a student from a different group', function (callback) {
  //       request(locals.assessmentInstanceURL, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 403) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //   });

  //   describe('18. access control of student who are not in any group', function () {
  //     it('should be able to switch to the ungrouped student', function (callback) {
  //       var student = locals.studentUserNotGrouped;
  //       config.authUid = student.uid;
  //       config.authName = student.name;
  //       config.authUin = '00000004';
  //       callback(null);
  //     });
  //     it('should NOT be able to access the assessment instance 1 as a ungrouped student', function (callback) {
  //       request(locals.assessmentInstanceURL, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 403) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //   });

  //   describe('19. access control of student who are in a different group', function () {
  //     it('should be able to switch to the student in the different group', function (callback) {
  //       var student = locals.studentUserInDiffGroup;
  //       config.authUid = student.uid;
  //       config.authName = student.name;
  //       config.authUin = '00000005';
  //       callback(null);
  //     });
  //     it('should load assessment page successfully', function (callback) {
  //       request(locals.assessmentUrl, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 200) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //     it('should parse', function () {
  //       locals.$ = cheerio.load(page);
  //     });
  //     it('should have a CSRF token', function () {
  //       elemList = locals.$('form input[name="__csrf_token"]');
  //       assert.lengthOf(elemList, 2);
  //       assert.nestedProperty(elemList[0], 'attribs.value');
  //       locals.__csrf_token = elemList[0].attribs.value;
  //       assert.isString(locals.__csrf_token);
  //     });
  //     it('should be able to create a group', function (callback) {
  //       locals.group_name_alternative2 = 'groupBBCC';
  //       var form = {
  //         __action: 'create_group',
  //         __csrf_token: locals.__csrf_token,
  //         groupName: locals.group_name_alternative2,
  //       };
  //       request.post(
  //         { url: locals.assessmentUrl, form: form, followAllRedirects: true },
  //         function (error, response, body) {
  //           if (ERR(error, callback)) return;
  //           if (response.statusCode !== 200) {
  //             return callback(new Error('bad status: ' + response.statusCode));
  //           }
  //           page = body;
  //           callback(null);
  //         }
  //       );
  //     });
  //     it('should NOT be able to access the assessment instance 1 as a student from a different group', function (callback) {
  //       request(locals.assessmentInstanceURL, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 403) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //   });

  //   describe('20. cross assessment grouping', function () {
  //     it('should contain a second group-based homework assessment', function (callback) {
  //       sqldb.query(sql.select_group_work_assessment, [], function (err, result) {
  //         if (ERR(err, callback)) return;
  //         assert.lengthOf(result.rows, 2);
  //         assert.notEqual(result.rows[1].id, undefined);
  //         callback(null);
  //       });
  //     });
  //     it('should load the second assessment page successfully', function (callback) {
  //       request(locals.assessmentUrl_2, function (error, response, body) {
  //         if (ERR(error, callback)) return;
  //         if (response.statusCode !== 200) {
  //           return callback(new Error('bad status: ' + response.statusCode, { response, body }));
  //         }
  //         page = body;
  //         callback(null);
  //       });
  //     });
  //     it('should parse', function () {
  //       locals.$ = cheerio.load(page);
  //     });
  //     it('should have a CSRF token', function () {
  //       elemList = locals.$('form input[name="__csrf_token"]');
  //       assert.lengthOf(elemList, 2);
  //       assert.nestedProperty(elemList[0], 'attribs.value');
  //       locals.__csrf_token = elemList[0].attribs.value;
  //       assert.isString(locals.__csrf_token);
  //     });
  //     it('should NOT be able to join group using the join code from a different assessment', function (callback) {
  //       var form = {
  //         __action: 'join_group',
  //         __csrf_token: locals.__csrf_token,
  //         join_code: locals.joinCode,
  //       };
  //       request.post(
  //         { url: locals.assessmentUrl_2, form: form, followAllRedirects: true },
  //         function (error, response, body) {
  //           if (ERR(error, callback)) return;
  //           if (response.statusCode !== 200) {
  //             return callback(new Error('bad status: ' + response.statusCode));
  //           }
  //           page = body;
  //           callback(null);
  //         }
  //       );
  //       it('should contain a prompt to inform the user that the group is full', function () {
  //         elemList = locals.$('.alert:contains(It is already full)');
  //         assert.lengthOf(elemList, 1);
  //       });
  //     });
  //   });
});
