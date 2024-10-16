import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { stringify } from '@prairielearn/csv';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { updateAssessmentStatistics } from '../../lib/assessment.js';
import { AssessmentSchema } from '../../lib/db-types.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';

import {
  AssessmentScoreHistogramByDateSchema,
  DurationStatSchema,
  InstructorAssessmentStatistics,
  UserScoreSchema,
  type Filenames,
} from './instructorAssessmentStatistics.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

function getFilenames(locals: Record<string, any>): Filenames {
  const prefix = assessmentFilenamePrefix(
    locals.assessment,
    locals.assessment_set,
    locals.course_instance,
    locals.course,
  );

  return {
    scoreStatsCsvFilename: prefix + 'score_stats.csv',
    durationStatsCsvFilename: prefix + 'duration_stats.csv',
    statsByDateCsvFilename: prefix + 'scores_by_date.csv',
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await updateAssessmentStatistics(res.locals.assessment.id);

    // re-fetch assessment to get updated statistics
    const assessment = await sqldb.queryRow(
      sql.select_assessment,
      { assessment_id: res.locals.assessment.id },
      AssessmentSchema,
    );

    // get formatted duration statistics
    //
    // Note that these statistics only consider the highest-scoring assessment
    // instance for each user, so the scatter plot of instance durations vs
    // scores won't include low-scoring instances. It's not clear if we want to
    // change this.
    const durationStat = await sqldb.queryRow(
      sql.select_duration_stats,
      { assessment_id: res.locals.assessment.id },
      DurationStatSchema,
    );

    const assessmentScoreHistogramByDate = await sqldb.queryRows(
      sql.assessment_score_histogram_by_date,
      { assessment_id: res.locals.assessment.id },
      AssessmentScoreHistogramByDateSchema,
    );

    const userScores = await sqldb.queryRows(
      sql.user_scores,
      { assessment_id: res.locals.assessment.id },
      UserScoreSchema,
    );

    res.send(
      InstructorAssessmentStatistics({
        resLocals: res.locals,
        assessment,
        durationStat,
        assessmentScoreHistogramByDate,
        userScores,
        filenames: getFilenames(res.locals),
      }),
    );
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    const filenames = getFilenames(res.locals);

    await updateAssessmentStatistics(res.locals.assessment.id);

    // re-fetch assessment to get updated statistics
    const assessmentResult = await sqldb.queryOneRowAsync(sql.select_assessment, {
      assessment_id: res.locals.assessment.id,
    });
    res.locals.assessment = assessmentResult.rows[0].assessment;

    if (req.params.filename === filenames.scoreStatsCsvFilename) {
      const csvData = [
        [
          res.locals.course.short_name,
          res.locals.course_instance.short_name,
          res.locals.assessment_set.name,
          res.locals.assessment.number,
          res.locals.assessment_set.abbreviation + res.locals.assessment.number,
          res.locals.assessment.title,
          res.locals.assessment.tid,
          res.locals.assessment.score_stat_number,
          res.locals.assessment.score_stat_mean,
          res.locals.assessment.score_stat_std,
          res.locals.assessment.score_stat_min,
          res.locals.assessment.score_stat_max,
          res.locals.assessment.score_stat_median,
          res.locals.assessment.score_stat_n_zero,
          res.locals.assessment.score_stat_n_hundred,
          res.locals.assessment.score_stat_n_zero_perc,
          res.locals.assessment.score_stat_n_hundred_perc,
          ...res.locals.assessment.score_stat_hist,
        ],
      ];

      res.attachment(req.params.filename);
      stringify(csvData, {
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
          ...res.locals.assessment.score_stat_hist.map((_, i) => `Hist ${i + 1}`),
        ],
      }).pipe(res);
    } else if (req.params.filename === filenames.durationStatsCsvFilename) {
      // get formatted duration statistics
      const durationStatsResult = await sqldb.queryOneRowAsync(sql.select_duration_stats, {
        assessment_id: res.locals.assessment.id,
      });
      const duration_stat = durationStatsResult.rows[0];

      const csvData = [
        [
          res.locals.course.short_name,
          res.locals.course_instance.short_name,
          res.locals.assessment_set.name,
          res.locals.assessment.number,
          res.locals.assessment_set.abbreviation + res.locals.assessment.number,
          res.locals.assessment.title,
          res.locals.assessment.tid,
          duration_stat.mean_mins,
          duration_stat.median_mins,
          duration_stat.min_mins,
          duration_stat.max_mins,
          ...duration_stat.threshold_seconds,
          ...duration_stat.hist,
        ],
      ];

      res.attachment(req.params.filename);
      stringify(csvData, {
        header: true,
        columns: [
          'Course',
          'Instance',
          'Set',
          'Number',
          'Assessment',
          'Title',
          'AID',
          'Mean duration (min)',
          'Median duration (min)',
          'Min duration (min)',
          'Max duration (min)',
          ...duration_stat.threshold_seconds.map((_, i) => `Hist boundary ${i + 1} (s)`),
          ...duration_stat.hist.map((_, i) => `Hist ${i + 1}`),
        ],
      }).pipe(res);
    } else if (req.params.filename === filenames.statsByDateCsvFilename) {
      const histByDateResult = await sqldb.queryAsync(sql.assessment_score_histogram_by_date, {
        assessment_id: res.locals.assessment.id,
      });
      const scoresByDay = histByDateResult.rows;

      const numDays = scoresByDay.length;
      const numGroups = scoresByDay[0].histogram.length;

      const csvData: (string | number)[][] = [];

      let groupData = ['Number'];
      for (let day = 0; day < numDays; day++) {
        groupData.push(scoresByDay[day].number);
      }
      csvData.push(groupData);

      groupData = ['Mean score perc'];
      for (let day = 0; day < numDays; day++) {
        groupData.push(scoresByDay[day].mean_score_perc);
      }
      csvData.push(groupData);

      for (let group = 0; group < numGroups; group++) {
        groupData = [group * 10 + '% to ' + (group + 1) * 10 + '%'];
        for (let day = 0; day < numDays; day++) {
          groupData.push(scoresByDay[day].histogram[group]);
        }
        csvData.push(groupData);
      }

      res.attachment(req.params.filename);
      stringify(csvData, {
        header: true,
        columns: ['Date', ...scoresByDay.map((day) => day.date_formatted)],
      }).pipe(res);
    } else {
      throw new error.HttpStatusError(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

export default router;
