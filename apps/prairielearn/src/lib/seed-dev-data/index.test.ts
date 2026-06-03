import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { selectAssessmentHasInstances } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectOptionalCourseByPath } from '../../models/course.js';
import { selectOpenInstanceQuestionsForAssessment } from '../../models/instance-question.js';
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

describe('seedDevData', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('seeds the test course and is idempotent', async () => {
    const result = await seedDevData();
    assert.isFalse(result.skipped);
    assert.equal(result.studentsSeeded, SEED_STUDENT_COUNT);

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
    const manualQuestions = assessmentQuestions.filter(
      (aq) => (aq.assessment_question.max_manual_points ?? 0) > 0,
    );
    assert.isAbove(manualQuestions.length, 0);

    // Every manual question gets a generated rubric.
    for (const mq of manualQuestions) {
      const { rubric, rubric_items } = await selectCompleteRubric(mq.assessment_question.id);
      assert.isNotNull(rubric);
      assert.isAbove(rubric_items.length, 0);
    }

    // Grading is random (~50%) over every manual submission; with 30 students
    // per manual question an all-or-nothing split is astronomically unlikely,
    // so a strict interior range is a safe assertion.
    assert.isAbove(result.graded, 0);
    assert.isBelow(result.graded, manualQuestions.length * SEED_STUDENT_COUNT);

    // Regression guard: manualGrade/addingNumbers2 is declared `gradingMethod:
    // Manual` but carries only auto points, which the grading pipeline
    // auto-grades like an internal question. It must be seeded and graded, not
    // dropped by the auto-vs-manual classification.
    const instanceQuestions = await selectOpenInstanceQuestionsForAssessment(assessment.id);
    const autoOnlyManual = instanceQuestions.filter(
      (row) => row.question.qid === 'manualGrade/addingNumbers2',
    );
    assert.lengthOf(autoOnlyManual, SEED_STUDENT_COUNT);
    assert.isTrue(autoOnlyManual.every((row) => row.instance_question.status !== 'unanswered'));

    // Second run is a no-op because the assessment already has instances.
    const second = await seedDevData();
    assert.isTrue(second.skipped);
    assert.equal(second.studentsSeeded, 0);
  });
});
