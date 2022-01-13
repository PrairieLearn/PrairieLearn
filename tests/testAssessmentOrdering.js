const util = require('util');
const assert = require('chai').assert;
const { step } = require('mocha-steps');

const config = require('../lib/config');
const sqldb = require('../prairielib/sql-db');
const sqlLoader = require('../prairielib/sql-loader');
const sqlEquiv = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
const helperClient = require('./helperClient');

describe('Course with assessments grouped by unit vs set', function () {
  this.timeout(60000);

  const context = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  context.assessmentsUrl = `${context.courseInstanceBaseUrl}/assessments`;

  before('set up testing server', async function () {
    await util.promisify(helperServer.before().bind(this))();
  });
  after('shut down testing server', helperServer.after);

  step('testCourse should implicitly have assessments_group_by=Set after sync', async function () {
    const result = await sqldb.queryOneRowAsync(sqlEquiv.get_test_course, []);
    assert.equal(result.rows[0].assessments_group_by, 'Set');
  });

  async function fetchAssessmentsPage() {
    const response = await helperClient.fetchCheerio(context.assessmentsUrl);
    assert.isTrue(response.ok);
    return response;
  }

  function testHeadingOrder(response, assessmentHeadings) {
    const headings = response.$('table th[data-testid="assessment-group-heading"]');
    assert.lengthOf(
      headings,
      assessmentHeadings.length,
      'If you recently added a new assessment to the testCourse, you need to set "unit":"misc".'
    );
    headings.each((i, heading) => {
      let headingText = response.$(heading).text();
      assert(
        headingText.includes(assessmentHeadings[i]),
        `expected ${headingText} to include ${assessmentHeadings[i]}`
      );
    });
  }

  function extractAssessmentSetBadgeText(response) {
    const badgeText = [];
    response.$('table [data-testid="assessment-set-badge"]').each((i, badge) => {
      badgeText.push(response.$(badge).text().trim());
    });
    return badgeText;
  }

  step('check heading order for assessments_group_by=Set', async function () {
    const response = await fetchAssessmentsPage();

    const setHeadings = ['Homeworks', 'Exams'];
    testHeadingOrder(response, setHeadings);

    // save list of assessment badges to compare to future values
    context.assessmentBadges = extractAssessmentSetBadgeText(response);
  });

  step('set assessments_group_by=Unit in db', async function () {
    const result = await sqldb.queryOneRowAsync(sqlEquiv.test_course_assessments_group_by_unit, []);
    assert(result.rows[0].id, 1);
  });

  step('check heading and assessment order for assessments_group_by=Unit', async function () {
    const response = await fetchAssessmentsPage();

    const unitHeadings = [
      'Intro to PrairieLearn',
      'Examination with proctors',
      'Alternate grading techniques',
      'Working with partners',
      'Miscellaneous assessments',
    ];
    testHeadingOrder(response, unitHeadings);

    const badges = extractAssessmentSetBadgeText(response);

    // only check the order for the first 3 units,
    // to avoid breaking this test every time a new assessment gets added.
    const expectedBadges = [
      // intro
      'HW1',
      'HW2',
      'E1',
      'E2',
      // cbtf
      'E3',
      'E4',
      // grading
      'HW3',
      'HW4',
      'E5',
      'E6',
      'E7',
      'E8',
    ];
    assert.sameOrderedMembers(
      badges.slice(0, expectedBadges.length),
      expectedBadges,
      'First three units have assessments in expected order'
    );

    // compare this new set of badges with the old one
    assert.sameMembers(
      badges,
      context.assessmentBadges,
      'Assessments are consistent between assessments_group_by=Set and assessments_group_by=Unit'
    );
  });
});
