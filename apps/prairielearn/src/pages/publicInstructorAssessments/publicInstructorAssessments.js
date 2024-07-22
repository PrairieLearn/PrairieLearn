// @ts-check
import { pipeline } from 'node:stream/promises';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  updateAssessmentStatisticsForCourseInstance,
} from '../../lib/assessment.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';

import {
  AssessmentRowSchema,
  InstructorAssessments,
} from './publicInstructorAssessments.html.js';


const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function buildCsvFilename(locals) {
  return `${courseInstanceFilenamePrefix(locals.course_instance, locals.course)}assessment_stats.csv`;
}


router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id)
    res.locals.course = await selectCourseById(courseId)
    res.locals.course_instance = await selectCourseInstanceById(res.locals.course_instance_id)

    const csvFilename = await buildCsvFilename(res.locals);

    const rows = await sqldb.queryRows(
      sql.select_assessments,
      {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      },
      AssessmentRowSchema,
    );

    const assessmentIdsNeedingStatsUpdate = rows
      .filter((row) => row.needs_statistics_update)
      .map((row) => row.id);

    res.send(
      InstructorAssessments({
        resLocals: res.locals,
        rows,
        assessmentIdsNeedingStatsUpdate,
        csvFilename,
      }),
    );
  }),
);

export default router;
