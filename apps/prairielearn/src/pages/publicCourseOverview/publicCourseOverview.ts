// @ts-check
import { pipeline } from 'node:stream/promises';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { selectCourseById, selectAllCoursesInstancesOfCourseById } from '../../models/course.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';

import { AssessmentRowSchema, InstructorAssessments } from '../publicInstructorAssessments/publicInstructorAssessments.html.js';
import { ResponseLaunchTemplateDataFilterSensitiveLog } from '@aws-sdk/client-ec2';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.course = await selectCourseById(res.locals.course_id);
    res.locals.course_instances_ids = await selectAllCoursesInstancesOfCourseById(res.locals.course_id); // TEST, need to get all course instances for the course (though may need to be filtered in some way)
    res.locals.urlPrefix = `/pl`;

    const allRows: typeof AssessmentRowSchema[] = [];
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
        allRows.push(...rows);
      }
    }

    const assessmentIdsNeedingStatsUpdate = allRows.map((row) => row.id); // TEST, remove? Not needed in this context, but InstructorAssessments expects it

    res.send(
      InstructorAssessments({
        resLocals: res.locals,
        rows: allRows,
        assessmentIdsNeedingStatsUpdate,
      }),
    );
  }),
);

export default router;
