import assert from 'node:assert';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { selectAssessmentQuestions } from '../../models/assessment-question.js';
import { selectAssessmentSetById } from '../../models/assessment-set.js';
import { selectAssessmentById, selectAssessmentIsPublic } from '../../models/assessment.js';
import { selectCourseByCourseInstanceId } from '../../models/course.js';

import { PublicAssessmentQuestions } from './publicAssessmentQuestions.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const assessment_id = req.params.assessment_id;
    const course_instance_id = req.params.course_instance_id;
    const isAssessmentPublic = await selectAssessmentIsPublic(assessment_id);
    if (!isAssessmentPublic) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    const course = await selectCourseByCourseInstanceId(course_instance_id.toString());
    res.locals.course = course;
    const assessment = await selectAssessmentById(assessment_id);
    res.locals.assessment = assessment;

    assert(assessment.assessment_set_id);
    const assessment_set = await selectAssessmentSetById(assessment.assessment_set_id);

    const questions = await selectAssessmentQuestions({
      assessment_id,
    });

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
        course,
        course_instance_id,
        questions,
      }),
    );
  }),
);

export default router;
