// @ts-check
const util = require('util');
const assert = require('chai').assert;
const { step } = require('mocha-steps');
const { v4: uuid } = require('uuid');

const config = require('../lib/config');
const sqldb = require('../prairielib/sql-db');
const sqlLoader = require('../prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');
const {
  getCourseData,
  COURSE_INSTANCE_ID,
  writeCourseToTempDirectory,
  overwriteAndSyncCourseData,
} = require('./sync/util');

describe('Course with assessments grouped by Set vs Module', function () {
  this.timeout(60000);

  const context = {};
  context.courseDir = null;
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  context.assessmentsUrl = `${context.courseInstanceBaseUrl}/assessments`;

  const course = getCourseData();
  course.course.assessmentSets = [
    {
      name: 'Homeworks',
      abbreviation: 'HW',
      heading: 'Homeworks',
      color: 'red1',
    },
    {
      name: 'Exams',
      abbreviation: 'E',
      heading: 'Exams',
      color: 'red2',
    },
  ];
  course.course.assessmentModules = [
    {
      name: 'Module 1',
      heading: 'Module 1',
    },
    {
      name: 'Module 2',
      heading: 'Module 2',
    },
  ];
  course.courseInstances[COURSE_INSTANCE_ID].assessments = {
    'homework-1': {
      uuid: uuid(),
      title: 'Homework 1',
      type: 'Homework',
      set: 'Homeworks',
      module: 'Module 1',
      number: '1',
    },
    'exam-1': {
      uuid: uuid(),
      title: 'Exam 1',
      type: 'Exam',
      set: 'Exams',
      module: 'Module 1',
      number: '1',
    },
    'homework-2': {
      uuid: uuid(),
      title: 'Homework 2',
      type: 'Homework',
      set: 'Homeworks',
      module: 'Module 2',
      number: '2',
    },
    'exam-2': {
      uuid: uuid(),
      title: 'Exam 2',
      type: 'Exam',
      set: 'Exams',
      module: 'Module 2',
      number: '2',
    },
  };

  async function fetchAssessmentsPage() {
    const response = await helperClient.fetchCheerio(context.assessmentsUrl);
    assert.isTrue(response.ok);
    return response;
  }

  function testHeadingOrder(response, assessmentHeadings) {
    const headings = response.$('table th[data-testid="assessment-group-heading"]');
    assert.lengthOf(headings, assessmentHeadings.length);
    headings.each((i, heading) => {
      let headingText = response.$(heading).text();
      assert.equal(headingText.trim(), assessmentHeadings[i]);
    });
  }

  function extractAssessmentSetBadgeText(response) {
    const badgeText = [];
    response.$('table [data-testid="assessment-set-badge"]').each((i, badge) => {
      badgeText.push(response.$(badge).text().trim());
    });
    return badgeText;
  }

  before('set up testing server', async function () {
    context.courseDir = await writeCourseToTempDirectory(course);
    await util.promisify(helperServer.before(context.courseDir).bind(this))();
  });
  after('shut down testing server', helperServer.after);

  step('should default to grouping by Set', async function () {
    const result = await sqldb.queryOneRowAsync(sql.get_test_course, []);
    assert.equal(result.rows[0].assessments_group_by, 'Set');
  });

  step('should use correct order when grouping by Set', async function () {
    const response = await fetchAssessmentsPage();

    const setHeadings = ['Homeworks', 'Exams'];
    testHeadingOrder(response, setHeadings);

    // save list of assessment badges to compare to future values
    context.assessmentBadges = extractAssessmentSetBadgeText(response);
  });

  step('should use correct order when grouping by Module', async function () {
    // Update course to group by Module
    course.courseInstances[COURSE_INSTANCE_ID].groupBy = 'Module';
    await overwriteAndSyncCourseData(course, context.courseDir);

    const result = await sqldb.queryOneRowAsync(sql.test_course_assessments_group_by_module, []);

    const response = await fetchAssessmentsPage();

    const moduleHeadings = ['Module 1', 'Module 2'];
    testHeadingOrder(response, moduleHeadings);

    const badges = extractAssessmentSetBadgeText(response);

    const expectedBadges = [
      // Module 1
      'HW1',
      'E1',
      // Module 2
      'HW2',
      'E2',
    ];
    assert.sameOrderedMembers(badges, expectedBadges);

    // compare this new set of badges with the old one
    assert.sameMembers(badges, context.assessmentBadges);
  });
});
