import { setImmediate } from 'node:timers/promises';

import * as async from 'async';
import { omit, sum, sumBy } from 'es-toolkit';
import mustache from 'mustache';
import { z } from 'zod';

import { markdownToHtml } from '@prairielearn/markdown';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import type { SubmissionForRender } from '../components/SubmissionPanel.js';
import { selectInstanceQuestionGroups } from '../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';

import { updateAssessmentInstanceGrade } from './assessment-grading.js';
import {
  type Assessment,
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  RubricItemSchema,
  RubricSchema,
  type Submission,
} from './db-types.js';
import { idsEqual } from './id.js';
import * as ltiOutcomes from './ltiOutcomes.js';
import {
  type AppliedRubricItem,
  AppliedRubricItemSchema,
  InstanceQuestionToUpdateSchema,
  PartialScoresSchema,
  type RubricData,
  RubricDataSchema,
  RubricGradingDataSchema,
  type RubricItemInput,
  SubmissionForScoreUpdateSchema,
} from './manualGrading.types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Builds the URL of an instance question tagged to be manually graded for a particular
 * assessment question. Only returns instance questions assigned to a particular grader.
 *
 * @param options - The options for generating the next instance question URL.
 * @param options.urlPrefix - URL prefix for the current course instance.
 * @param options.assessment_id - The assessment linked to the assessment question. Used to ensure the assessment is authorized, since middlewares don't authenticate assessment questions.
 * @param options.assessment_question_id - The assessment question being graded.
 * @param options.user_id - The user_id of the current grader. Typically the current effective user.
 * @param options.prior_instance_question_id - The instance question previously graded. Used to ensure a consistent order if a grader starts grading from the middle of a list or skips an instance.
 * @param options.skip_graded_submissions - If true, the returned next submission must require manual grading. Otherwise, it does not, but will have a higher pseudorandomly-generated stable order.
 * @param options.show_submissions_assigned_to_me_only - If true, the returned next submission must be assigned to the current grader or unassigned. Otherwise, submissions assigned to any grader may be returned.
 * @param options.use_instance_question_groups - Whether or not to use the instance question groups to determine the next instance question.
 */
export async function nextInstanceQuestionUrl({
  urlPrefix,
  assessment_id,
  assessment_question_id,
  user_id,
  prior_instance_question_id,
  skip_graded_submissions,
  show_submissions_assigned_to_me_only,
  use_instance_question_groups,
}: {
  urlPrefix: string;
  assessment_id: string;
  assessment_question_id: string;
  user_id: string;
  prior_instance_question_id: string | null;
  skip_graded_submissions: boolean;
  show_submissions_assigned_to_me_only: boolean;
  use_instance_question_groups: boolean;
}): Promise<string> {
  const prior_instance_question_group_id = await run(async () => {
    if (!use_instance_question_groups) {
      return null;
    }
    if (prior_instance_question_id) {
      return await sqldb.queryOptionalRow(
        sql.instance_question_group_id_for_instance_question,
        {
          instance_question_id: prior_instance_question_id,
        },
        IdSchema.nullable(),
      );
    } else {
      const instanceQuestionGroups = await selectInstanceQuestionGroups({
        assessmentQuestionId: assessment_question_id,
      });
      return instanceQuestionGroups.at(0)?.id ?? null;
    }
  });

  let next_instance_question_id = await sqldb.queryOptionalRow(
    sql.select_next_instance_question,
    {
      assessment_id,
      assessment_question_id,
      user_id,
      prior_instance_question_id,
      prior_instance_question_group_id,
      skip_graded_submissions,
      show_submissions_assigned_to_me_only,
      use_instance_question_groups,
    },
    IdSchema.nullable(),
  );

  if (
    use_instance_question_groups &&
    next_instance_question_id == null &&
    prior_instance_question_group_id != null
  ) {
    const next_instance_question_group_id = await sqldb.queryOptionalRow(
      sql.select_next_instance_question_group_id,
      {
        assessment_question_id,
        prior_instance_question_group_id,
      },
      IdSchema.nullable(),
    );

    // Check if there exists another instance question in the next instance question group
    next_instance_question_id = await sqldb.queryOptionalRow(
      sql.select_next_instance_question,
      {
        assessment_id,
        assessment_question_id,
        user_id,
        prior_instance_question_id: null,
        prior_instance_question_group_id: next_instance_question_group_id,
        skip_graded_submissions,
        show_submissions_assigned_to_me_only,
        use_instance_question_groups,
      },
      IdSchema,
    );
  }

  if (next_instance_question_id !== null) {
    return `${urlPrefix}/assessment/${assessment_id}/manual_grading/instance_question/${next_instance_question_id}`;
  }

  // If we have no more instance questions, then redirect back to main assessment question page
  return `${urlPrefix}/assessment/${assessment_id}/manual_grading/assessment_question/${assessment_question_id}`;
}

/**
 * Selects a variety of rubric data for a given assessment question.
 * If a submission is provided, the rubric items are rendered
 * as Mustache templates with the submission's data. Empty strings
 * are skipped to avoid unnecessary processing.
 */
export async function selectRubricData({
  assessment_question,
  submission,
}: {
  assessment_question?: AssessmentQuestion | null;
  submission?: Submission | SubmissionForRender | null;
}): Promise<RubricData | null> {
  // If there is no assessment question (e.g., in question preview), there is no rubric
  if (!assessment_question?.manual_rubric_id) return null;

  const rubric_data = await sqldb.queryOptionalRow(
    sql.select_rubric_data,
    {
      assessment_question_id: assessment_question.id,
      rubric_id: assessment_question.manual_rubric_id,
    },
    RubricDataSchema,
  );

  if (submission) {
    // Render rubric items: description, explanation and grader note
    const mustacheParams = {
      correct_answers: submission.true_answer ?? {},
      params: submission.params ?? {},
      submitted_answers: submission.submitted_answer,
    };

    for (const item of rubric_data?.rubric_items || []) {
      item.description_rendered = item.rubric_item.description
        ? markdownToHtml(mustache.render(item.rubric_item.description || '', mustacheParams), {
            inline: true,
          })
        : '';
      item.explanation_rendered = item.rubric_item.explanation
        ? markdownToHtml(mustache.render(item.rubric_item.explanation || '', mustacheParams))
        : '';
      item.grader_note_rendered = item.rubric_item.grader_note
        ? markdownToHtml(mustache.render(item.rubric_item.grader_note || '', mustacheParams))
        : '';

      // Yield to the event loop to avoid blocking too long.
      await setImmediate();
    }
  }

  return rubric_data;
}

/**
 * Builds the locals object for rubric grading data. Can be called with any object that contains a
 * `manual_rubric_grading_id` field, typically a submission or grading job. Updates the object
 * in-place by adding a `rubric_grading` value, as well as the rendered version of the manual
 * feedback.
 *
 * @param submission - The object whose rubric grading must be retrieved and populated. Typically a submission or grading job.
 */
export async function populateManualGradingData(submission: Record<string, any>): Promise<void> {
  if (submission.manual_rubric_grading_id) {
    submission.rubric_grading = await sqldb.queryOptionalRow(
      sql.select_rubric_grading_data,
      { rubric_grading_id: submission.manual_rubric_grading_id },
      RubricGradingDataSchema,
    );
  }
  if (submission.feedback?.manual) {
    submission.feedback_manual_html = markdownToHtml(submission.feedback?.manual?.toString() || '');
  }
}

/**
 * Updates the rubric settings for an assessment question.
 *
 * @param params
 * @param params.assessment - The assessment associated with the assessment question. Assumed to be safe.
 * @param params.assessment_question_id - The ID of the assessment question being updated. Assumed to be authenticated.
 * @param params.use_rubric - Indicates if a rubric should be used for manual grading.
 * @param params.replace_auto_points - If true, the rubric is used to compute the total points. If false, the rubric is used to compute the manual points.
 * @param params.starting_points - The points to assign to a question as a start, before rubric items are applied. Typically 0 for positive grading, or the total points for negative grading.
 * @param params.min_points - The minimum number of points to assign based on a rubric (floor). Computed points from rubric items are never assigned less than this, even if items bring the total to less than this value, unless an adjustment is used.
 * @param params.max_extra_points - The maximum number of points to assign based on a rubric beyond the question's assigned points (ceiling). Computed points from rubric items over the assigned points are never assigned more than this, even if items bring the total to more than this value, unless an adjustment is used.
 * @param params.rubric_items - An array of items available for grading. The `order` property is used to determine the order of the items. If an item has an `id` property that corresponds to an existing rubric item, it is updated, otherwise it is inserted.
 * @param params.tag_for_manual_grading - If true, tags all currently graded instance questions to be graded again using the new rubric values. If false, existing gradings are recomputed if necessary, but their grading status is retained.
 * @param params.grader_guidelines - General guidance and instructions for applying and interpreting the rubric.
 * @param params.authn_user_id - The user_id of the logged in user.
 */
export async function updateAssessmentQuestionRubric({
  assessment,
  assessment_question_id,
  use_rubric,
  replace_auto_points,
  starting_points,
  min_points,
  max_extra_points,
  rubric_items,
  tag_for_manual_grading,
  grader_guidelines,
  authn_user_id,
}: {
  assessment: Assessment;
  assessment_question_id: string;
  use_rubric: boolean;
  replace_auto_points: boolean;
  starting_points: number;
  min_points: number;
  max_extra_points: number;
  rubric_items: RubricItemInput[];
  tag_for_manual_grading: boolean;
  grader_guidelines: string | null;
  authn_user_id: string;
}): Promise<void> {
  // Basic validation: points and description must exist, description must be within size limits
  if (use_rubric) {
    if (rubric_items.length === 0) {
      throw new Error('No rubric items were provided.');
    }

    rubric_items.forEach((item) => {
      if (item.points == null) {
        throw new Error('Rubric item provided without a points value.');
      }
      if (item.description == null || item.description === '') {
        throw new Error('Rubric item provided without a description.');
      }
      if (item.description.length > 100) {
        throw new Error(
          'Rubric item description is too long, must be no longer than 100 characters. Use the explanation for further comments.',
        );
      }
    });
  }

  await sqldb.runInTransactionAsync(async () => {
    const assessment_question = await sqldb.queryRow(
      sql.select_assessment_question_for_update,
      { assessment_question_id },
      AssessmentQuestionSchema,
    );

    if (use_rubric) {
      const max_points =
        (replace_auto_points
          ? (assessment_question.max_points ?? 0)
          : (assessment_question.max_manual_points ?? 0)) + Number(max_extra_points);

      // This test is done inside the transaction to avoid a race condition in case the assessment
      // question's values change.
      if (max_points <= Number(min_points)) {
        throw new Error(
          `Question has no range of possible points. Rubric points are limited to a minimum of ${min_points} and a maximum of ${max_points}.`,
        );
      }
    }

    const current_rubric_id = assessment_question.manual_rubric_id;
    let new_rubric_id = current_rubric_id;

    if (!use_rubric) {
      // Rubric exists, but should not exist, remove
      new_rubric_id = null;
    } else if (current_rubric_id === null) {
      // Rubric does not exist yet, but should, insert new rubric
      new_rubric_id = await sqldb.queryRow(
        sql.insert_rubric,
        { starting_points, min_points, max_extra_points, replace_auto_points, grader_guidelines },
        IdSchema,
      );
    } else {
      // Rubric already exists, update its settings
      await sqldb.execute(sql.update_rubric, {
        rubric_id: new_rubric_id,
        starting_points,
        min_points,
        max_extra_points,
        grader_guidelines,
        replace_auto_points,
      });
    }

    if (new_rubric_id !== current_rubric_id) {
      // Update rubric ID in assessment question
      await sqldb.execute(sql.update_assessment_question_rubric_id, {
        assessment_question_id,
        manual_rubric_id: new_rubric_id,
      });
    }

    if (use_rubric) {
      // Update rubric items. Start by soft-deleting rubric items that are no longer active.
      await sqldb.execute(sql.delete_rubric_items, {
        rubric_id: new_rubric_id,
        active_rubric_items: rubric_items.map((item) => item.id).filter(Boolean),
      });

      rubric_items.sort((a, b) => a.order - b.order);
      await async.eachOfSeries(
        rubric_items.map((item, number) => ({
          // Set default values to ensure fields exist, will be overridden by the spread
          id: null,
          explanation: null,
          grader_note: null,
          ...item,
          number,
          rubric_id: new_rubric_id,
        })),
        async (item) => {
          // Attempt to update the rubric item based on the ID. If the ID is not set or does not
          // exist, insert a new rubric item.
          if (item.id == null) {
            await sqldb.execute(sql.insert_rubric_item, omit(item, ['order', 'id']));
          } else {
            await sqldb.queryRow(sql.update_rubric_item, omit(item, ['order']), IdSchema);
          }
        },
      );

      await recomputeInstanceQuestions(assessment, assessment_question_id, authn_user_id);
    }

    if (tag_for_manual_grading) {
      await sqldb.execute(sql.tag_for_manual_grading, { assessment_question_id });
    }
  });
}

/**
 * Recomputes all graded instance questions based on changes in the rubric settings and items. A new grading job is created, but only if settings or item points are changed.
 *
 * @param assessment - The assessment associated with the instance question. Assumed to be safe.
 * @param assessment_question_id - The ID of the assessment question being updated. Assumed to be authenticated.
 * @param authn_user_id - The user_id of the logged in user.
 */
async function recomputeInstanceQuestions(
  assessment: Assessment,
  assessment_question_id: string,
  authn_user_id: string,
): Promise<void> {
  await sqldb.runInTransactionAsync(async () => {
    // Recompute grades for existing instance questions using this rubric
    const instance_questions = await sqldb.queryRows(
      sql.select_instance_questions_to_update,
      { assessment_question_id },
      InstanceQuestionToUpdateSchema,
    );

    await async.eachSeries(instance_questions, async (instance_question) => {
      await updateInstanceQuestionScore({
        assessment,
        instance_question_id: instance_question.instance_question_id,
        submission_id: instance_question.submission_id,
        check_modified_at: null,
        score: { manual_rubric_data: instance_question },
        authn_user_id,
        is_ai_graded: instance_question.is_ai_graded,
      });
    });
  });
}

/**
 * Creates a new grading object for a specific rubric.
 *
 * @param rubric_id - ID of the rubric (typically retrieved from the assessment question).
 * @param max_points - number of points assigned as the maximum number of points to the assessment question.
 * @param max_manual_points - number of points assigned as the maximum number of manual points to the assessment question.
 * @param rubric_items - array of items to apply to the grading.
 * @param adjust_points - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @returns The ID and points of the created rubric grading.
 */
export async function insertRubricGrading(
  rubric_id: string,
  max_points: number,
  max_manual_points: number,
  rubric_items: AppliedRubricItem[],
  adjust_points: number | null,
): Promise<{ id: string; computed_points: number; replace_auto_points: boolean }> {
  return sqldb.runInTransactionAsync(async () => {
    const { rubric_data, rubric_item_data } = await sqldb.queryRow(
      sql.select_rubric_items,
      { rubric_id, rubric_items: rubric_items.map((item) => item.rubric_item_id) },
      z.object({ rubric_data: RubricSchema, rubric_item_data: z.array(RubricItemSchema) }),
    );

    const sum_rubric_item_points = sum(
      rubric_items.map(
        (item) =>
          (item.score ?? 1) *
          (rubric_item_data.find((db_item) => idsEqual(db_item.id, item.rubric_item_id))?.points ??
            0),
      ),
    );
    const computed_points =
      Math.min(
        Math.max(rubric_data.starting_points + sum_rubric_item_points, rubric_data.min_points),
        (rubric_data.replace_auto_points ? max_points : max_manual_points) +
          rubric_data.max_extra_points,
      ) + Number(adjust_points || 0);

    const rubric_grading_id = await sqldb.queryRow(
      sql.insert_rubric_grading,
      {
        rubric_id,
        computed_points,
        adjust_points: adjust_points || 0,
        rubric_items: JSON.stringify(rubric_items),
      },
      IdSchema,
    );

    return {
      id: rubric_grading_id,
      computed_points,
      replace_auto_points: rubric_data.replace_auto_points,
    };
  });
}

const InstanceQuestionScoreInputSchema = z.object({
  /** The manual points to assign to the instance question. */
  manual_points: z.coerce.number().nullish(),
  /** The percentage of manual points to assign to the instance question. */
  manual_score_perc: z.coerce.number().nullish(),
  /** The auto points to assign to the instance question. */
  auto_points: z.coerce.number().nullish(),
  /** The percentage of auto points to assign to the instance question. */
  auto_score_perc: z.coerce.number().nullish(),
  /** The total points to assign to the instance question. If provided, the manual points are assigned this value minus the question's auto points. */
  points: z.coerce.number().nullish(),
  /** The percentage of total points to assign to the instance question. If provided, the manual points are assigned the equivalent of points for this value minus the question's auto points. */
  score_perc: z.coerce.number().nullish(),
  /** Feedback data to be provided to the student. Freeform, though usually contains a `manual` field for markdown-based comments. */
  feedback: z.record(z.string(), z.any()).nullish(),
  /** Partial scores associated to individual elements. Must match the format accepted by individual elements. If provided, auto_points are computed based on this value. */
  partial_scores: PartialScoresSchema.nullish(),
  /** Rubric items associated to the grading of manual points. If provided, overrides manual points. */
  manual_rubric_data: z
    .object({
      rubric_id: IdSchema,
      applied_rubric_items: AppliedRubricItemSchema.array().nullish(),
      adjust_points: z.coerce.number().nullish(),
    })
    .nullish(),
});
export type InstanceQuestionScoreInput = z.infer<typeof InstanceQuestionScoreInputSchema>;

/**
 * Manually updates the score of an instance question.
 * @param params
 * @param params.assessment - The assessment associated with the instance question. Assumed to be safe.
 * @param params.instance_question_id - The ID of the instance question to be updated. May or may not be safe.
 * @param params.submission_id - The ID of the submission. Optional, if not provided the last submission if the instance question is used.
 * @param params.check_modified_at - The value of modified_at when the question was retrieved, optional. If provided, and the modified_at value does not match this value, a grading job is created but the score is not updated.
 * @param params.score - The score values to be used for update.
 * @param params.authn_user_id - The user_id of the logged in user.
 * @param params.is_ai_graded - Whether the score update is the result of AI grading or manual grading
 * @returns The ID of the grading job created, if any, and a flag indicating if the score was not updated due to a modified_at conflict.
 */
export async function updateInstanceQuestionScore({
  assessment,
  instance_question_id,
  submission_id,
  check_modified_at,
  score,
  authn_user_id,
  is_ai_graded = false,
}: {
  assessment: Assessment;
  instance_question_id: string;
  submission_id: string | null;
  check_modified_at: Date | null;
  score: InstanceQuestionScoreInput;
  authn_user_id: string;
  is_ai_graded?: boolean;
}): Promise<{ grading_job_id: string | null; modified_at_conflict: boolean }> {
  return sqldb.runInTransactionAsync(async () => {
    const current_submission = await sqldb.queryRow(
      sql.select_submission_for_score_update,
      {
        assessment_id: assessment.id,
        instance_question_id,
        submission_id,
        check_modified_at: check_modified_at?.toISOString(),
      },
      SubmissionForScoreUpdateSchema,
    );

    score = InstanceQuestionScoreInputSchema.parse(score);

    let new_points: number | null = null;
    let new_score_perc: number | null = null;
    let new_auto_score_perc: number | null = null;
    let new_auto_points: number | null = null;
    let new_manual_points: number | null = null;
    let manual_rubric_grading_id: string | null = null;

    if (score.partial_scores) {
      if (typeof score.partial_scores !== 'object') {
        throw new Error('partial_scores is not an object');
      }
      if (current_submission.partial_scores) {
        score.partial_scores = { ...current_submission.partial_scores, ...score.partial_scores };
      }
      new_auto_score_perc =
        (100 *
          sumBy(
            Object.values(score.partial_scores),
            (value) => (value.score ?? 0) * (value.weight ?? 1),
          )) /
        sumBy(Object.values(score.partial_scores), (value) => value.weight ?? 1);
      new_auto_points = (new_auto_score_perc / 100) * (current_submission.max_auto_points ?? 0);
    }

    if (score.auto_score_perc != null) {
      if (score.auto_points != null) {
        throw new Error('Cannot set both auto_score_perc and auto_points');
      }
      if (score.score_perc != null) {
        throw new Error('Cannot set both auto_score_perc and score_perc');
      }
      new_auto_score_perc = Number(score.auto_score_perc);
      new_auto_points = (new_auto_score_perc * (current_submission.max_auto_points ?? 0)) / 100;
    } else if (score.auto_points != null) {
      if (score.points != null) {
        throw new Error('Cannot set both auto_points and points');
      }
      new_auto_points = Number(score.auto_points);
      new_auto_score_perc =
        current_submission.max_auto_points != null && current_submission.max_auto_points > 0
          ? (new_auto_points * 100) / current_submission.max_auto_points
          : 0;
    }

    if (current_submission.manual_rubric_id && score.manual_rubric_data?.rubric_id) {
      const manual_rubric_grading = await insertRubricGrading(
        score.manual_rubric_data.rubric_id,
        current_submission.max_points ?? 0,
        current_submission.max_manual_points ?? 0,
        score.manual_rubric_data.applied_rubric_items ?? [],
        score.manual_rubric_data.adjust_points ?? 0,
      );
      score.manual_points =
        manual_rubric_grading.computed_points -
        (manual_rubric_grading.replace_auto_points
          ? (new_auto_points ?? current_submission.auto_points ?? 0)
          : 0);
      score.manual_score_perc = undefined;
      manual_rubric_grading_id = manual_rubric_grading.id;
    } else if (
      current_submission.manual_rubric_id &&
      score.points == null &&
      score.score_perc == null &&
      score.manual_points == null &&
      score.manual_score_perc == null
    ) {
      // If there is a rubric, and the manual_points will not be updated, keep the current rubric grading.
      manual_rubric_grading_id = current_submission.manual_rubric_grading_id;
    } else {
      // If the manual_points will be updated and the rubric grading has not been set, clear the rubric grading.
      manual_rubric_grading_id = null;
    }

    if (score.manual_score_perc != null) {
      if (score.manual_points != null) {
        throw new Error('Cannot set both manual_score_perc and manual_points');
      }
      if (score.score_perc != null) {
        throw new Error('Cannot set both manual_score_perc and score_perc');
      }
      new_manual_points =
        (Number(score.manual_score_perc) * (current_submission.max_manual_points ?? 0)) / 100;
      new_points = new_manual_points + (new_auto_points ?? current_submission.auto_points ?? 0);
      new_score_perc =
        current_submission.max_points != null && current_submission.max_points > 0
          ? (new_points * 100) / current_submission.max_points
          : 0;
    } else if (score.manual_points != null) {
      if (score.points != null) {
        throw new Error('Cannot set both manual_points and points');
      }
      new_manual_points = Number(score.manual_points);
      new_points = new_manual_points + (new_auto_points ?? current_submission.auto_points ?? 0);
      new_score_perc =
        current_submission.max_points != null && current_submission.max_points > 0
          ? (new_points * 100) / current_submission.max_points
          : 0;
    } else if (score.score_perc != null) {
      if (score.points != null) {
        throw new Error('Cannot set both score_perc and points');
      }
      new_score_perc = Number(score.score_perc);
      new_points = (new_score_perc * (current_submission.max_points ?? 0)) / 100;
      new_manual_points = new_points - (new_auto_points ?? current_submission.auto_points ?? 0);
    } else if (score.points != null) {
      new_points = Number(score.points);
      new_score_perc =
        current_submission.max_points != null && current_submission.max_points > 0
          ? (new_points * 100) / current_submission.max_points
          : 0;
      new_manual_points = new_points - (new_auto_points ?? current_submission.auto_points ?? 0);
    } else if (new_auto_points != null) {
      new_points = new_auto_points + (current_submission.manual_points ?? 0);
      new_score_perc =
        current_submission.max_points != null && current_submission.max_points > 0
          ? (new_points * 100) / current_submission.max_points
          : 0;
    }

    let grading_job_id: string | null = null;

    // if we were originally provided a submission_id or we have feedback or partial scores, create a
    // grading job and update the submission
    if (
      current_submission.submission_id &&
      ((submission_id != null && idsEqual(current_submission.submission_id, submission_id)) ||
        new_score_perc != null ||
        score.feedback ||
        score.partial_scores)
    ) {
      grading_job_id = await sqldb.queryRow(
        sql.insert_grading_job,
        {
          submission_id: current_submission.submission_id,
          authn_user_id,
          grading_method: is_ai_graded ? 'AI' : 'Manual',
          correct: new_auto_score_perc == null ? null : new_auto_score_perc > 50,
          score: new_score_perc == null ? null : new_score_perc / 100,
          auto_points: new_auto_points,
          manual_points: new_manual_points,
          feedback: score.feedback,
          partial_scores: score.partial_scores,
          manual_rubric_grading_id,
        },
        IdSchema,
      );

      if (!current_submission.modified_at_conflict && current_submission.submission_id) {
        await sqldb.executeRow(sql.update_submission_score, {
          submission_id: current_submission.submission_id,
          feedback: score.feedback,
          partial_scores: score.partial_scores,
          manual_rubric_grading_id,
          score: new_auto_score_perc == null ? null : new_auto_score_perc / 100,
          correct: new_auto_score_perc == null ? null : new_auto_score_perc > 50,
          is_ai_graded,
        });
      }
    }

    // do the score update of the instance_question, log it, and update the assessment_instance, if we
    // have a new_score
    if (new_score_perc != null && !current_submission.modified_at_conflict) {
      await sqldb.execute(sql.update_instance_question_score, {
        instance_question_id: current_submission.instance_question_id,
        points: new_points,
        score_perc: new_score_perc,
        auto_points: new_auto_points,
        manual_points: new_manual_points,
        score: new_auto_score_perc == null ? null : new_auto_score_perc / 100,
        authn_user_id,
        max_points: current_submission.max_points,
        max_manual_points: current_submission.max_manual_points,
        max_auto_points: current_submission.max_auto_points,
        is_ai_graded,
      });

      await updateAssessmentInstanceGrade({
        assessment_instance_id: current_submission.assessment_instance_id,
        authn_user_id,
        credit: 100,
        allowDecrease: true,
      });

      // TODO: this ends up running inside a transaction. This is not good.
      await ltiOutcomes.updateScore(current_submission.assessment_instance_id);
    }

    return {
      grading_job_id,
      modified_at_conflict: current_submission.modified_at_conflict,
    };
  });
}
