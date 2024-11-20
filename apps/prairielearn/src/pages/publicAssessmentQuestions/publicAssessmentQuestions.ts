import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { selectAssessmentQuestions } from '../../models/assessment-question.js';
import { checkAssessmentPublic, selectAssessmentById } from '../../models/assessment.js';
import { selectCourseByCourseInstanceId } from '../../models/course.js';

import { InstructorAssessmentQuestions } from './publicAssessmentQuestions.html.js';

const router = express.Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const assessment_id = req.params.assessment_id
    const course_instance_id = req.params.course_instance_id
    const isAssessmentPublic = await checkAssessmentPublic(assessment_id);
    if (!isAssessmentPublic) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    const course = await selectCourseByCourseInstanceId(course_instance_id.toString());
    if (course.sharing_name === null) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    res.locals.course = course; // TEST, pass to res.locals? Need for PublicNavbar
    const assessment = await selectAssessmentById(assessment_id);

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
      InstructorAssessmentQuestions({
        resLocals: res.locals,
        assessment,
        course,
        questions,
        course_sharing_name: course.sharing_name,
      }),
    );
  }),
);

export default router;
