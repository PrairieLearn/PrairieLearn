import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { selectAccessControlRules } from '../models/assessment-access-control-rules.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { ASSESSMENT_ID, getCourseData, writeCourseToTempDirectory } from './sync/util.js';
import { withConfig } from './utils/config.js';

describe('Modern access control on the student assessments page', { timeout: 60_000 }, () => {
  const siteUrl = `http://localhost:${config.serverPort}`;
  const assessmentTitle = 'Explicit empty access control';
  let assessmentsUrl: string;

  beforeAll(async () => {
    const course = getCourseData();
    course.courseInstances.Fa19.assessments[ASSESSMENT_ID] = {
      ...course.courseInstances.Fa19.assessments[ASSESSMENT_ID],
      title: assessmentTitle,
      accessControl: [],
    };

    const courseDir = await writeCourseToTempDirectory(course);
    await withConfig({ features: { 'enhanced-access-control': true } }, async () => {
      await helperServer.before(courseDir)();
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Previewer',
      authn_user_id: '1',
    });

    assessmentsUrl = `${siteUrl}/pl/course_instance/1/assessments`;
  });

  afterAll(helperServer.after);

  test.sequential(
    'syncs explicit empty access control as a modern assessment with no rules',
    async () => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: ASSESSMENT_ID,
      });
      const rules = await selectAccessControlRules(assessment, [
        'none',
        'student_label',
        'enrollment',
      ]);

      assert.isTrue(assessment.modern_access_control);
      assert.lengthOf(rules, 0);
    },
  );

  test.sequential('hides the assessment from students', async () => {
    const response = await helperClient.fetchCheerio(assessmentsUrl, {
      headers: { cookie: 'pl_test_user=test_student' },
    });

    assert.isTrue(response.ok);
    assert.lengthOf(response.$(`td:contains("${assessmentTitle}")`), 0);
    assert.lengthOf(response.$(`a:contains("${assessmentTitle}")`), 0);
  });

  test.sequential('shows the assessment to staff via the staff override', async () => {
    const response = await helperClient.fetchCheerio(assessmentsUrl, {
      headers: { cookie: 'pl_test_user=test_instructor' },
    });

    assert.isTrue(response.ok);
    assert.lengthOf(response.$(`a:contains("${assessmentTitle}")`), 1);
  });
});
