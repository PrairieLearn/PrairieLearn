import { assert } from 'chai';
import { step } from 'mocha-steps';
import { v4 as uuid } from 'uuid';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';

import * as helperServer from './helperServer';
import * as helperClient from './helperClient';
import {
  getCourseData,
  COURSE_INSTANCE_ID,
  writeCourseToTempDirectory,
  overwriteAndSyncCourseData,
} from './sync/util';

const sql = sqldb.loadSqlEquiv(__filename);

describe('Course with assessments grouped by Set vs Module', function () {
  this.timeout(60000);

  let courseDir;
  let courseInstanceId = null;
  let assessmentBadges;

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
    const assessmentsUrl = `http://localhost:${config.serverPort}/pl/course_instance/${courseInstanceId}/assessments`;
    const response = await helperClient.fetchCheerio(assessmentsUrl);
    assert.isTrue(response.ok);
    return response;
  }

  function testHeadingOrder(response, assessmentHeadings) {
    const headings = response.$('table th[data-testid="assessment-group-heading"]');
    assert.lengthOf(headings, assessmentHeadings.length);
    headings.each((i, heading) => {
      const headingText = response.$(heading).text();
      assert.equal(headingText.trim(), assessmentHeadings[i]);
    });
  }

  function extractAssessmentSetBadgeText(response) {
    const badgeText: string[] = [];
    response.$('table [data-testid="assessment-set-badge"]').each((i, badge) => {
      badgeText.push(response.$(badge).text().trim());
    });
    return badgeText;
  }

  before('set up testing server', async function () {
    courseDir = await writeCourseToTempDirectory(course);
    await helperServer.before(courseDir).call(this);
    const courseInstanceResult = await sqldb.queryOneRowAsync(sql.get_test_course, {});
    courseInstanceId = courseInstanceResult.rows[0].id;
  });
  after('shut down testing server', helperServer.after);

  step('should default to grouping by Set', async function () {
    const result = await sqldb.queryOneRowAsync(sql.get_test_course, []);
    assert.equal(result.rows[0].assessments_group_by, 'Set');
  });

  step('should use correct order when grouping by Set', async function () {
    const response = await fetchAssessmentsPage();
    testHeadingOrder(response, ['Homeworks', 'Exams']);

    // save list of assessment badges to compare to future values
    assessmentBadges = extractAssessmentSetBadgeText(response);
  });

  step('should use correct order when grouping by Module', async function () {
    // Update course to group by Module
    course.courseInstances[COURSE_INSTANCE_ID].courseInstance.groupAssessmentsBy = 'Module';
    await overwriteAndSyncCourseData(course, courseDir);

    const response = await fetchAssessmentsPage();
    testHeadingOrder(response, ['Module 1', 'Module 2']);

    const badges = extractAssessmentSetBadgeText(response);
    assert.sameOrderedMembers(badges, [
      // Module 1
      'HW1',
      'E1',
      // Module 2
      'HW2',
      'E2',
    ]);

    // compare this new set of badges with the old one
    assert.sameMembers(badges, assessmentBadges);
  });
});
