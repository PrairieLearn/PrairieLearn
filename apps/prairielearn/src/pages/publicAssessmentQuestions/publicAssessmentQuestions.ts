import assert from 'node:assert';

import { Router } from 'express';

import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import type { Assessment } from '../../lib/db-types.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectAssessmentSetById } from '../../models/assessment-set.js';

import { PublicAssessmentQuestions } from './publicAssessmentQuestions.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  typedAsyncHandler<'public-course-instance', { assessment: Assessment }>(async (req, res) => {
    const { assessment } = res.locals;

    assert(assessment.assessment_set_id);
    const assessment_set = await selectAssessmentSetById(assessment.assessment_set_id);

    const questions = await selectAssessmentQuestions({ assessment_id: assessment.id });

    // Filter out non-public assessments
    for (const question of questions) {
      question.other_assessments =
        question.other_assessments?.filter(
          (assessment) => assessment.assessment_share_source_publicly,
        ) ?? [];
    }

    res.send(
      PublicAssessmentQuestions({
        resLocals: res.locals,
        assessment,
        assessment_set,
        course: res.locals.course,
        course_instance_id: res.locals.course_instance.id,
        questions,
      }),
    );
  }),
);

export default router;
