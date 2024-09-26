// @ts-check
import { pipeline } from 'node:stream/promises';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { features } from '../../lib/features/index.js';
import { selectCourseById, selectAllCoursesInstancesOfCourseById } from '../../models/course.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectPublicQuestionsForCourse } from '../../models/questions.js';

import { AssessmentRowSchema, InstructorAssessments } from '../publicInstructorAssessments/publicInstructorAssessments.html.js';
import { QuestionsPage } from '../publicQuestions/publicQuestions.html.js';
import { CombinedPage } from './publicCourseOverview.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Assessments
    res.locals.course = await selectCourseById(res.locals.course_id);
    res.locals.course_instances_ids = await selectAllCoursesInstancesOfCourseById(res.locals.course.id); // TEST, need to get all course instances for the course (though may need to be filtered in some way)
    res.locals.urlPrefix = `/pl`;

    const assessmentRows: typeof AssessmentRowSchema[] = [];
    for (const courseInstanceId of res.locals.course_instances_ids) {
      const courseInstance = await selectCourseInstanceById(courseInstanceId);
      if (courseInstance) {
        const rows: typeof AssessmentRowSchema[] = await sqldb.queryRows(
          sql.select_assessments,
          {
            course_instance_id: courseInstance.id,
            assessments_group_by: courseInstance.assessments_group_by,
          },
          AssessmentRowSchema,
        );
        assessmentRows.push(...rows);
      }
    }
    
    // Questions
    const questionSharingEnabled = await features.enabled('question-sharing', {
      course_id: res.locals.course.id,
      institution_id: res.locals.course.institution_id,
    });

    // if (!questionSharingEnabled) { // TEST, uncomment
    //   throw new error.HttpStatusError(404, 'This course does not have public question sharing enabled');
    // }

    const questions = await selectPublicQuestionsForCourse(res.locals.course.id);
    const questionsData = QuestionsPage({
      questions,
      showAddQuestionButton: false,
      resLocals: res.locals,
    });

    res.send(
      CombinedPage({
        assessmentRows,
        questions: questionsData,
        resLocals: res.locals,
      }),
    );

    // Course Instances
    

  }),
);

export default router;
