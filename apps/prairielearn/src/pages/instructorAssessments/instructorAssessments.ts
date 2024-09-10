import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryRows,
  queryOptionalRow,
  queryCursor,
  queryRow,
} from '@prairielearn/postgres';

import {
  updateAssessmentStatistics,
  updateAssessmentStatisticsForCourseInstance,
} from '../../lib/assessment.js';
import { AssessmentSchema, IdSchema } from '../../lib/db-types.js';
import { AssessmentAddEditor } from '../../lib/editors.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';

import {
  AssessmentRowSchema,
  AssessmentStats,
  InstructorAssessments,
} from './instructorAssessments.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function buildCsvFilename(locals: Record<string, any>) {
  return `${courseInstanceFilenamePrefix(locals.course_instance, locals.course)}assessment_stats.csv`;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const csvFilename = buildCsvFilename(res.locals);

    const rows = await queryRows(
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
  '/stats/:assessment_id',
  asyncHandler(async (req, res) => {
    // Update statistics for this assessment. We do this before checking authz
    // on the assessment but this is ok because we won't send any data back if
    // we aren't authorized.
    await updateAssessmentStatistics(req.params.assessment_id);

    // When fetching the assessment, we don't check whether it needs an update
    // again because we don't want to get get stuck in a loop perpetually
    // updating because students are still working.
    const row = await queryOptionalRow(
      sql.select_assessment,
      {
        course_instance_id: res.locals.course_instance.id, // for authz checking
        assessment_id: req.params.assessment_id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
      },
      AssessmentSchema,
    );
    if (row == null) {
      throw new HttpStatusError(404, `Assessment not found: ${req.params.assessment_id}`);
    }

    res.send(AssessmentStats({ row }).toString());
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

      const cursor = await queryCursor(sql.select_assessments, {
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
          'NStudents',
          'Mean',
          'Std',
          'Min',
          'Max',
          'Median',
          'NZero',
          'NHundred',
          'NZeroPerc',
          'NHundredPerc',
          'Hist1',
          'Hist2',
          'Hist3',
          'Hist4',
          'Hist5',
          'Hist6',
          'Hist7',
          'Hist8',
          'Hist9',
          'Hist10',
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
            record.score_stat_number,
            record.score_stat_mean,
            record.score_stat_std,
            record.score_stat_min,
            record.score_stat_max,
            record.score_stat_median,
            record.score_stat_n_zero,
            record.score_stat_n_hundred,
            record.score_stat_n_zero_perc,
            record.score_stat_n_hundred_perc,
            ...record.score_stat_hist,
          ];
        },
      });

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifier, res);
    } else {
      throw new HttpStatusError(404, `Unknown filename: ${req.params.filename}`);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_assessment') {
      const editor = new AssessmentAddEditor({ locals: res.locals });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(`${res.locals.urlPrefix}/edit_error/${serverJob.jobSequenceId}`);
        return;
      }

      const assessment_id = await queryRow(
        sql.select_assessment_id_from_uuid,
        { uuid: editor.uuid, course_instance_id: res.locals.course_instance.id },
        IdSchema,
      );
      res.redirect(`${res.locals.urlPrefix}/assessment/${assessment_id}/settings`);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
