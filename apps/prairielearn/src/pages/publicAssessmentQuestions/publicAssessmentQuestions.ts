import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { selectAssessmentQuestions } from '../../models/assessment-question.js';
import { checkAssessmentPublic, selectAssessmentById } from '../../models/assessment.js';
import { selectCourseByCourseInstanceId } from '../../models/course.js';

import { PublicAssessmentQuestions } from './publicAssessmentQuestions.html.js';

const router = express.Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const assessment_id = req.params.assessment_id;
    const course_instance_id = req.params.course_instance_id;
    const isAssessmentPublic = await checkAssessmentPublic(assessment_id);
    if (!isAssessmentPublic) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    const course = await selectCourseByCourseInstanceId(course_instance_id.toString());
    res.locals.course = course;
    res.locals.assessment = await selectAssessmentById(assessment_id);

    const questions = await selectAssessmentQuestions({
      assessment_id,
      course_id: course.id,
    });

    // Filter out non-public assessments
    for (const question of questions) {
      question.other_assessments =
        question.other_assessments?.filter((assessment) => assessment.share_source_publicly) ?? [];
    }

    res.send(
      PublicAssessmentQuestions({
        resLocals: res.locals,
        assessment: res.locals.assessment,
        course,
        course_instance_id,
        questions,
      }),
    );
  }),
);

export default router;
