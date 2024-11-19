import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { selectAssessmentQuestions } from '../../models/assessment-question.js';
import { checkAssessmentPublic, selectAssessmentById } from '../../models/assessment.js';
import { selectCourseByCourseInstanceId } from '../../models/course.js';

import { InstructorAssessmentQuestions } from './publicAssessmentQuestions.html.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isAssessmentPublic = await checkAssessmentPublic(res.locals.assessment_id);
    if (!isAssessmentPublic) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    const course = await selectCourseByCourseInstanceId(res.locals.course_instance_id.toString());
    if (course.sharing_name === null) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    res.locals.course = course; // TEST, pass to res.locals? Need for PublicNavbar
    const assessment = await selectAssessmentById(res.locals.assessment_id);

    const questions = await selectAssessmentQuestions({
      assessment_id: assessment.id,
      course_id: course.id,
    });

    // Filter out non-public assessments
    for (const question of questions) {
      question.other_assessments =
        question.other_assessments?.filter((assessment) => assessment.share_source_publicly) ?? [];
    }

    res.send(
      InstructorAssessmentQuestions({ resLocals: res.locals, assessment, course, questions }),
    );
  }),
);

export default router;
