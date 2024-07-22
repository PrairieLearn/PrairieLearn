// @ts-check
import { pipeline } from 'node:stream/promises';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  updateAssessmentStatistics,
  updateAssessmentStatisticsForCourseInstance,
} from '../../lib/assessment.js';
import { AssessmentSchema, IdSchema } from '../../lib/db-types.js';
import { AssessmentAddEditor } from '../../lib/editors.js';
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

router.get(
  '/file/:filename',
  asyncHandler(async (req, res) => {
    if (req.params.filename === buildCsvFilename(res.locals)) {
      // There is no need to check if the user has permission to view student
      // data, because this file only has aggregate data.

      // update assessment statistics if needed
      await updateAssessmentStatisticsForCourseInstance(res.locals.course_instance.id);

      const cursor = await sqldb.queryCursor(sql.select_assessments, {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      });

      const stringifier = stringifyStream({
        header: true,
        columns: [
          'Course',
          'Instance',
          'Set',
          'Number',
          'Assessment',
          'Title',
          'AID',
        ],
        transform(record) {
          return [
            res.locals.course.short_name,
            res.locals.course_instance.short_name,
            record.name,
            record.assessment_number,
            record.label,
            record.title,
            record.tid,
          ];
        },
      });

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifier, res);
    } else {
      throw new error.HttpStatusError(404, `Unknown filename: ${req.params.filename}`);
    }
  }),
);

export default router;
