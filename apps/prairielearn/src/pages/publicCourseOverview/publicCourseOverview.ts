// @ts-check
import { pipeline } from 'node:stream/promises';

import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { features } from '../../lib/features/index.js';
import { selectCourseById, selectAllCoursesInstancesOfCourseById } from '../../models/course.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectPublicQuestionsForCourse } from '../../models/questions.js';


import { AssessmentRowSchema } from '../publicAssessmentPreview/publicAssessmentPreview.html.js';
import { CourseInstanceAuthzRow } from './publicCourseOverview.html.js';
import { publicCourseOverviewPage } from './publicCourseOverview.html.js';


const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Assessments
    res.locals.course = await selectCourseById(res.locals.course_id);
    res.locals.course_instances_ids = await selectAllCoursesInstancesOfCourseById(res.locals.course.id); // TEST, need to get all course instances for the course (though may need to be filtered in some way)
    res.locals.urlPrefix = `/pl`;

    let courseInstances = []; // TEST, can't get from selectCourseInstancesWithStaffAccess (yet at least)

    const assessmentRows: typeof AssessmentRowSchema[] = [];
    for (const courseInstanceId of res.locals.course_instances_ids) {
      const courseInstance = await selectCourseInstanceById(courseInstanceId);
      courseInstances.push(courseInstance); // TEST, 'fake' data for now since we're not using selectCourseInstancesWithStaffAccess (yet at least)
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

    // Course Instances
    try {
      await fs.access(res.locals.course.path);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.locals.needToSync = true;
      } else {
        throw new Error('Invalid course path');
      }
    }

    // TEST, can't get using this (yet at least)
    // const courseInstances: CourseInstanceAuthzRow[] = await selectCourseInstancesWithStaffAccess({
    //   course_id: res.locals.course.id,
    //   user_id: res.locals.user.user_id,
    //   authn_user_id: res.locals.authn_user.user_id,
    //   is_administrator: res.locals.is_administrator,
    //   authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    // });
  

    // Send response
    res.send(
      publicCourseOverviewPage({
        assessmentRows,
        questions,
        resLocals: res.locals,
        courseInstances: courseInstances,
      }),
    );
  }),
);

export default router;
