// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import AnsiUp from 'ansi_up';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { AssessmentQuestionSchema, IdSchema, TagSchema, TopicSchema } from '../../lib/db-types';

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questions = await sqldb.queryRows(
      sql.questions,
      {
        assessment_id: res.locals.assessment.id,
        course_id: res.locals.course.id,
      },
      AssessmentQuestionSchema.extend({
        alternative_group_number_choose: z.number().nullable(),
        alternative_group_number: z.number().nullable(),
        alternative_group_size: z.string().nullable(),
        assessment_question_advance_score_perc: z.number().nullable(),
        avg_question_score_perc: z.number().nullable(),
        display_name: z.string().nullable(),
        number: z.string().nullable(),
        open_issue_count: z.string().nullable(),
        other_assessments: z
          .array(
            z.object({
              color: z.string(),
              label: z.string(),
              assessment_id: IdSchema,
              course_instance_id: IdSchema,
            }),
          )
          .nullable(),
        sync_errors_ansified: z.string().optional(),
        sync_errors: z.string().nullable(),
        sync_warnings_ansified: z.string().optional(),
        sync_warnings: z.string().nullable(),
        topic: TopicSchema.nullable(),
        qid: z.string().nullable(),
        start_new_zone: z.boolean().nullable(),
        tags: z
          .array(
            z.object({
              color: z.string(),
              id: IdSchema,
              name: z.string(),
            }),
          )
          .nullable(),
        title: z.string().nullable(),
        zone_best_questions: z.string().nullable(),
        zone_has_best_questions: z.boolean().nullable(),
        zone_has_max_points: z.boolean().nullable(),
        zone_max_points: z.number().nullable(),
        zone_number_choose: z.number().nullable(),
        zone_number: z.number().nullable(),
        zone_title: z.string().nullable(),
      }),
    );
    res.locals.questions = questions.map((row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
      return row;
    });
    // console.log(res.locals.questions);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;

/**
 * ------------------------------
 * 
 * {
 *     [Object], [Object]
 *     [Object], [Object],
 *     [Object], [Object],
 *     [Object], [Object],
 *     [Object], [Object],
 *     [Object], [Object],
 *     color: 'red3',
 *     course_id: 2
 *     description: 'Basic algebra.',
 *     id: 34,
 *     name: 'Algebra',
 *     number: 1,
 *   ],
 *   },
 alternative_group_number_choose: null,
 alternative_group_number: 6,
 alternative_group_size: '1',
 avg_question_score_perc: null,
 display_name: 'partialCredit3'
 open_issue_count: '0',
 other_assessments: [
 qid: 'partialCredit3',
 start_new_zone: false,
 tags: [ [Object], [Object], [Object], [Object] ],
 title: 'Partial credit 3',
 zone_best_questions: null,
 zone_has_best_questions: false,
 zone_has_max_points: false,
 zone_max_points: null,
 zone_number_choose: null,
 zone_number: 1,
 zone_title: 'Hard questions',
 * 
 * 
 * 
 * 
 *   average_submission_score_hist: null,
 *   average_submission_score_variance: null,
 *   start_new_alternative_group: true,
 *   tags_string: 'mwest;tpl101;fa17;v3',
 * 
 * 
 * 
 * 
 * 
 *   xadvance_score_perc: null,
 *   xalternative_group_id: '263',
 *   xassessment_id: '35',
 *   xassessment_question_advance_score_perc: 0,
 *   xaverage_average_submission_score: null,
 *   xaverage_first_submission_score: null,
 *   xaverage_last_submission_score: null,
 *   xaverage_max_submission_score: null,
 *   xaverage_number_submissions: null,
 *   xdeleted_at: null,
 *   xdiscrimination: null,
 *   xeffective_advance_score_perc: 0,
 *   xfirst_submission_score_hist: null,
 *   xfirst_submission_score_variance: null,
 *   xforce_max_points: false,
 *   xgrade_rate_minutes: 0,
 *   xid: '282',
 *   xincremental_submission_points_array_averages: null,
 *   xincremental_submission_points_array_variances: null,
 *   xincremental_submission_score_array_averages: null,
 *   xincremental_submission_score_array_variances: null,
 *   xinit_points: null,
 *   xlast_submission_score_hist: null,
 *   xlast_submission_score_variance: null,
 *   xmanual_rubric_id: null,
 *   xmax_auto_points: 13,
 *   xmax_manual_points: 0,
 *   xmax_points: 13,
 *   xmax_submission_score_hist: null,
 *   xmax_submission_score_variance: null,
 *   xmean_question_score: null,
 *   xnumber_in_alternative_group: 1,
 *   xnumber_submissions_hist: null,
 *   xnumber_submissions_variance: null,
 *   xnumber: '6',
 *   xpoints_list: [ 13 ],
 *   xquestion_id: '192',
 *   xquestion_score_variance: null,
 *   xquintile_question_scores: null,
 *   xsome_nonzero_submission_perc: null,
 *   xsome_perfect_submission_perc: null,
 *   xsome_submission_perc: null,
 *   xsubmission_score_array_averages: null,
 *   xsubmission_score_array_variances: null,
 *   xsync_errors: null,
 *   xsync_warnings: '',
 *   xtopic: {
 *   xtries_per_variant: 1,
 */
