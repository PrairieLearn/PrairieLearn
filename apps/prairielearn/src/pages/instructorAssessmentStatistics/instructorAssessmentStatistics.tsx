import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import { z } from 'zod';

import { stringify, stringifyStream } from '@prairielearn/csv';
import * as error from '@prairielearn/error';
import {
  MINUTE_IN_MILLISECONDS,
  SECOND_IN_MILLISECONDS,
  formatDateYMD,
} from '@prairielearn/formatter';
import * as sqldb from '@prairielearn/postgres';
import { getLocalDate } from '@prairielearn/utils/timezone';

import { PageLayout } from '../../components/PageLayout.js';
import {
  updateAssessmentQuestionStatsForAssessment,
  updateAssessmentStatistics,
} from '../../lib/assessment.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { AssessmentInstanceSchema, AssessmentSchema } from '../../lib/db-types.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { STAT_DESCRIPTIONS } from '../shared/assessmentStatDescriptions.js';

import {
  type AssessmentQuestionStatsRow,
  AssessmentQuestionStatsRowSchema,
  type AssessmentScoreHistogramByDateSchema,
  type Filenames,
  InstructorAssessmentStatistics,
  UserScoreSchema,
} from './instructorAssessmentStatistics.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const AssessmentScoreByUserSchema = z.object({
  user_id: AssessmentInstanceSchema.shape.user_id,
  date: AssessmentInstanceSchema.shape.date,
  score_perc: AssessmentInstanceSchema.shape.score_perc,
});

export function groupAssessmentScoresByLocalDate(
  rows: z.infer<typeof AssessmentScoreByUserSchema>[],
  displayTimezone: string,
): z.infer<typeof AssessmentScoreHistogramByDateSchema>[] {
  const scoresByUserAndDate = new Map<string, number[]>();
  for (const row of rows) {
    if (row.date == null || row.score_perc == null) continue;
    const localDate = getLocalDate(row.date, displayTimezone).toString();
    const key = `${row.user_id ?? 'null'}\0${localDate}`;
    const scores = scoresByUserAndDate.get(key) ?? [];
    scores.push(row.score_perc);
    scoresByUserAndDate.set(key, scores);
  }

  const averagesByDate = new Map<string, number[]>();
  for (const [key, scores] of scoresByUserAndDate) {
    const localDate = key.split('\0')[1];
    const averages = averagesByDate.get(localDate) ?? [];
    averages.push(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    averagesByDate.set(localDate, averages);
  }

  return [...averagesByDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([localDate, scores]) => {
      const histogram = Array.from({ length: 10 }, () => 0);
      for (const score of scores) {
        const bucket = Math.max(0, Math.min(9, Math.floor(score / 10)));
        histogram[bucket]++;
      }
      return {
        date: new Date(`${localDate}T00:00:00.000Z`),
        number: scores.length,
        mean_score_perc: scores.reduce((sum, score) => sum + score, 0) / scores.length,
        histogram,
      };
    });
}

async function selectAssessmentScoreHistogramByDate(assessmentId: string, displayTimezone: string) {
  const rows = await sqldb.queryRows(
    sql.assessment_scores_by_user,
    { assessment_id: assessmentId },
    AssessmentScoreByUserSchema,
  );
  return groupAssessmentScoresByLocalDate(rows, displayTimezone);
}

function getFilenames(locals: ResLocalsForPage<'assessment'>): Filenames {
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
    questionStatsCsvFilename: prefix + 'question_stats.csv',
  };
}

router.get(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    await updateAssessmentStatistics(res.locals.assessment.id);

    // re-fetch assessment to get updated statistics
    const assessment = await sqldb.queryRow(
      sql.select_assessment,
      { assessment_id: res.locals.assessment.id },
      AssessmentSchema,
    );
    res.locals.assessment = assessment;

    const assessmentScoreHistogramByDate = await selectAssessmentScoreHistogramByDate(
      res.locals.assessment.id,
      res.locals.course_instance.display_timezone,
    );

    const userScores = await sqldb.queryRows(
      sql.user_scores,
      { assessment_id: res.locals.assessment.id },
      UserScoreSchema,
    );

    const rows = await sqldb.queryRows(
      sql.questions,
      { assessment_id: res.locals.assessment.id },
      AssessmentQuestionStatsRowSchema,
    );

    const filenames = getFilenames(res.locals);

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessment Statistics',
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'statistics',
        },
        options: {
          fullWidth: true,
        },
        headContent: compiledScriptTag('instructorAssessmentStatisticsClient.ts'),
        content: (
          <InstructorAssessmentStatistics
            assessment={assessment}
            courseInstance={res.locals.course_instance}
            assessmentSet={res.locals.assessment_set}
            hasCoursePermissionPreview={res.locals.authz_data.has_course_permission_preview}
            hasCoursePermissionEdit={res.locals.authz_data.has_course_permission_edit}
            hasCourseInstancePermissionEdit={
              res.locals.authz_data.has_course_instance_permission_edit
            }
            csrfToken={res.locals.__csrf_token}
            assessmentScoreHistogramByDate={assessmentScoreHistogramByDate}
            userScores={userScores}
            rows={rows}
            filenames={filenames}
          />
        ),
      }),
    );
  }),
);

router.get(
  '/:filename',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const filenames = getFilenames(res.locals);

    await updateAssessmentStatistics(res.locals.assessment.id);

    // re-fetch assessment to get updated statistics
    const assessment = await sqldb.queryRow(
      sql.select_assessment,
      { assessment_id: res.locals.assessment.id },
      AssessmentSchema,
    );
    res.locals.assessment = assessment;

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
      const csvData = [
        [
          res.locals.course.short_name,
          res.locals.course_instance.short_name,
          res.locals.assessment_set.name,
          res.locals.assessment.number,
          res.locals.assessment_set.abbreviation + res.locals.assessment.number,
          res.locals.assessment.title,
          res.locals.assessment.tid,
          res.locals.assessment.duration_stat_mean / MINUTE_IN_MILLISECONDS,
          res.locals.assessment.duration_stat_median / MINUTE_IN_MILLISECONDS,
          res.locals.assessment.duration_stat_min / MINUTE_IN_MILLISECONDS,
          res.locals.assessment.duration_stat_max / MINUTE_IN_MILLISECONDS,
          ...res.locals.assessment.duration_stat_thresholds.map((durationMs) =>
            Math.floor(durationMs / SECOND_IN_MILLISECONDS),
          ),
          ...res.locals.assessment.duration_stat_hist,
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
          ...res.locals.assessment.duration_stat_thresholds.map(
            (_, i) => `Hist boundary ${i + 1} (s)`,
          ),
          ...res.locals.assessment.duration_stat_hist.map((_, i) => `Hist ${i + 1}`),
        ],
      }).pipe(res);
    } else if (req.params.filename === filenames.statsByDateCsvFilename) {
      const histByDateResult = await selectAssessmentScoreHistogramByDate(
        res.locals.assessment.id,
        res.locals.course_instance.display_timezone,
      );
      const scoresByDay = histByDateResult;

      const numDays = scoresByDay.length;
      const numGroups = scoresByDay[0].histogram.length;

      const csvData: (string | number)[][] = [];

      let groupData: (string | number)[] = ['Number'];
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
        columns: [
          'Date',
          // The date is already extracted from the timestamp in the query and
          // returned as UTC, so we can safely format it without worrying
          // about timezones here.
          ...scoresByDay.map((day) => formatDateYMD(day.date, 'UTC')),
        ],
      }).pipe(res);
    } else if (req.params.filename === filenames.questionStatsCsvFilename) {
      const cursor = await sqldb.queryCursor(
        sql.questions,
        { assessment_id: res.locals.assessment.id },
        AssessmentQuestionStatsRowSchema,
      );

      const stringifier = stringifyStream<AssessmentQuestionStatsRow>({
        header: true,
        columns: [
          'Course',
          'Instance',
          'Assessment',
          'Question number',
          'QID',
          'Question title',
          'Question topic',
          'Question tags',
          ...Object.values(STAT_DESCRIPTIONS).map((d) => d.non_html_title),
        ],
        transform(record) {
          return [
            record.course_short_name,
            record.course_instance_short_name,
            record.assessment_label,
            record.assessment_question_number,
            record.qid,
            record.question_title,
            record.topic.name,
            record.question_tags,
            ...Object.values(STAT_DESCRIPTIONS).map((d) => record[d.field]),
          ];
        },
      });

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifier, res);
    } else {
      throw new error.HttpStatusError(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

router.post(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    // The action "refresh_stats" (from the button "Recalculate") does not
    // change student data. Statistics *should* be recalculated automatically,
    // e.g., every time this page is loaded, but until then we will let anyone who
    // can view the page post this action and trigger a recalculation.
    if (req.body.__action === 'refresh_stats') {
      await updateAssessmentQuestionStatsForAssessment(res.locals.assessment.id);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
