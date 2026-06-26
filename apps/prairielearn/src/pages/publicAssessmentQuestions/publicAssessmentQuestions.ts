import { Router } from 'express';

import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { PublicAssessmentQuestions } from './publicAssessmentQuestions.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  typedAsyncHandler<'public-assessment'>(async (req, res) => {
    const { assessment, assessment_set } = res.locals;

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
