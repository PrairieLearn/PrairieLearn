// @ts-check
const ERR = require('async-stacktrace');
import * as express from 'express';
const asyncHandler = require('express-async-handler');
import AnsiUp from 'ansi_up';
import * as error from '@prairielearn/error';
const debug = require('debug')('prairielearn:instructorAssessments');
import { logger } from '@prairielearn/logger';
import { stringifyStream } from '@prairielearn/csv';
import * as sqldb from '@prairielearn/postgres';
import { pipeline } from 'node:stream/promises';

import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name';
import { AssessmentAddEditor } from '../../lib/editors';
import {
  updateAssessmentStatistics,
  updateAssessmentStatisticsForCourseInstance,
} from '../../lib/assessment';

const router = express.Router();
const ansiUp = new AnsiUp();
const sql = sqldb.loadSqlEquiv(__filename);

const csvFilename = (locals) => {
  return (
    courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'assessment_stats.csv'
  );
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.csvFilename = csvFilename(res.locals);

    var params = {
      course_instance_id: res.locals.course_instance.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
      assessments_group_by: res.locals.course_instance.assessments_group_by,
    };
    const result = await sqldb.queryAsync(sql.select_assessments, params);
    res.locals.rows = result.rows;

    for (const row of res.locals.rows) {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
    }

    res.locals.assessment_ids_needing_stats_update = res.locals.rows
      .filter((row) => row.needs_statistics_update)
      .map((row) => row.id);

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
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
    var params = {
      course_instance_id: res.locals.course_instance.id, // for authz checking
      assessment_id: req.params.assessment_id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    };
    const result = await sqldb.queryAsync(sql.select_assessment, params);
    if (result.rowCount === 0) {
      throw error.make(404, `Assessment not found: ${req.params.assessment_id}`);
    }
    res.locals.row = result.rows[0];

    res.render(`${__dirname}/assessmentStats.ejs`, res.locals);
  }),
);

router.get(
  '/file/:filename',
  asyncHandler(async (req, res) => {
    if (req.params.filename === csvFilename(res.locals)) {
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
      throw error.make(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

router.post('/', (req, res, next) => {
  debug(`Responding to post with action ${req.body.__action}`);
  if (req.body.__action === 'add_assessment') {
    debug(`Responding to action add_assessment`);
    const editor = new AssessmentAddEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          debug(
            `Get assessment_id from uuid=${editor.uuid} with course_instance_id=${res.locals.course_instance.id}`,
          );
          sqldb.queryOneRow(
            sql.select_assessment_id_from_uuid,
            {
              uuid: editor.uuid,
              course_instance_id: res.locals.course_instance.id,
            },
            (err, result) => {
              if (ERR(err, next)) return;
              res.redirect(
                res.locals.urlPrefix + '/assessment/' + result.rows[0].assessment_id + '/settings',
              );
            },
          );
        }
      });
    });
  } else {
    next(error.make(400, `unknown __action: ${req.body.__action}`));
  }
});

export default router;
