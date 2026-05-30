import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { selectAssessmentHasInstances } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectOptionalCourseByPath } from '../../models/course.js';
import { selectCompleteRubric } from '../../models/rubrics.js';
import * as helperServer from '../../tests/helperServer.js';
import { selectAssessmentQuestions } from '../assessment-question.js';
import { TEST_COURSE_PATH } from '../paths.js';

import {
  SEED_STUDENT_COUNT,
  TARGET_ASSESSMENT_TID,
  TARGET_COURSE_INSTANCE_SHORT_NAME,
} from './constants.js';

import { seedDevData } from './index.js';

describe('seedDevData', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('seeds the test course and is idempotent', async () => {
    const result = await seedDevData();
    assert.isFalse(result.skipped);
    assert.equal(result.studentsSeeded, SEED_STUDENT_COUNT);
    // Grading is random (~50%); with 30 students an all-or-nothing split is
    // astronomically unlikely, so a strict interior range is a safe assertion.
    assert.isAbove(result.graded, 0);
    assert.isBelow(result.graded, SEED_STUDENT_COUNT);

    const course = await selectOptionalCourseByPath(TEST_COURSE_PATH);
    assert.isNotNull(course);
    const courseInstance = await selectCourseInstanceByShortName({
      course,
      shortName: TARGET_COURSE_INSTANCE_SHORT_NAME,
    });
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: TARGET_ASSESSMENT_TID,
    });

    assert.isTrue(await selectAssessmentHasInstances(assessment.id));

    const assessmentQuestions = await selectAssessmentQuestions({ assessment_id: assessment.id });
    const manualQuestion = assessmentQuestions.find(
      (aq) => (aq.assessment_question.max_manual_points ?? 0) > 0,
    );
    assert.isDefined(manualQuestion);
    const { rubric, rubric_items } = await selectCompleteRubric(
      manualQuestion.assessment_question.id,
    );
    assert.isNotNull(rubric);
    assert.isAbove(rubric_items.length, 0);

    // Second run is a no-op because the assessment already has instances.
    const second = await seedDevData();
    assert.isTrue(second.skipped);
    assert.equal(second.studentsSeeded, 0);
  });
});
