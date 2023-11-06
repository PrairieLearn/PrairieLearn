import * as async from 'async';
import * as mustache from 'mustache';
import { sum, sumBy } from 'lodash';
import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';

import { idsEqual } from './id';
import * as markdown from './markdown';
import * as ltiOutcomes from './ltiOutcomes';
import {
  AssessmentQuestionSchema,
  IdSchema,
  RubricGradingItemSchema,
  RubricGradingSchema,
  RubricItem,
  RubricItemSchema,
  RubricSchema,
} from './db-types';

const sql = sqldb.loadSqlEquiv(__filename);

interface AppliedRubricItem {
  /** ID of the rubric item to be applied. */
  rubric_item_id: string;
  /** Score to be applied to the rubric item. Defaults to 1 (100%), i.e., uses the full points assigned to the rubric item. */
  score?: number | null;
}

const RubricDataSchema = RubricSchema.extend({
  rubric_items: z.array(
    RubricItemSchema.extend({
      num_submissions: z.number(),
      description_rendered: z.string().optional(),
      explanation_rendered: z.string().optional(),
      grader_note_rendered: z.string().optional(),
    }),
  ),
});
export type RubricData = z.infer<typeof RubricDataSchema>;

const RubricGradingDataSchema = RubricGradingSchema.extend({
  rubric_items: z.record(IdSchema, RubricGradingItemSchema).nullable(),
});
export type RubricGradingData = z.infer<typeof RubricGradingDataSchema>;

const PartialScoresSchema = z
  .record(
    z.string(),
    z
      .object({
        score: z.coerce.number().nullish(),
        weight: z.coerce.number().nullish(),
      })
      .passthrough(),
  )
  .nullable();
type PartialScores = z.infer<typeof PartialScoresSchema>;

const SubmissionForScoreUpdateSchema = z.object({
  submission_id: IdSchema.nullable(),
  instance_question_id: IdSchema,
  assessment_instance_id: IdSchema,
  max_points: z.number().nullable(),
  max_auto_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  manual_rubric_id: IdSchema.nullable(),
  partial_scores: PartialScoresSchema,
  auto_points: z.number().nullable(),
  manual_points: z.number().nullable(),
  manual_rubric_grading_id: IdSchema.nullable(),
  modified_at_conflict: z.boolean(),
});

const InstanceQuestionToUpdateSchema = RubricGradingSchema.extend({
  assessment_id: IdSchema,
  assessment_instance_id: IdSchema,
  instance_question_id: IdSchema,
  submission_id: IdSchema,
  rubric_settings_changed: z.boolean(),
  applied_rubric_items: RubricGradingItemSchema.array().nullable(),
  rubric_items_changed: z.boolean(),
});

type RubricItemInput = Partial<RubricItem> & { order: number };

/** Builds the URL of an instance question tagged to be manually graded for a particular
 * assessment question. Only returns instance questions assigned to a particular grader.
 *
 * @param urlPrefix - URL prefix for the current course instance.
 * @param assessment_id - The assessment linked to the assessment question. Used to ensure the assessment is authorized, since middlewares don't authenticate assessment questions.
 * @param assessment_question_id - The assessment question being graded.
 * @param user_id - The user_id of the current grader. Typically the current effective user.
 * @param prior_instance_question_id - The instance question previously graded. Used to ensure a consistent order if a grader starts grading from the middle of a list or skips an instance.
 */
export async function nextUngradedInstanceQuestionUrl(
  urlPrefix: string,
  assessment_id: string,
  assessment_question_id: string,
  user_id: string,
  prior_instance_question_id: string | null,
): Promise<string> {
  const instance_question_id = await sqldb.queryOptionalRow(
    sql.select_next_ungraded_instance_question,
    { assessment_id, assessment_question_id, user_id, prior_instance_question_id },
    IdSchema,
  );

  if (instance_question_id != null) {
    return `${urlPrefix}/assessment/${assessment_id}/manual_grading/instance_question/${instance_question_id}`;
  }
  // If we have no more submissions, then redirect back to main assessment question page
  return `${urlPrefix}/assessment/${assessment_id}/manual_grading/assessment_question/${assessment_question_id}`;
}

/** Populates the locals objects for rubric data. Assigns values to `rubric_data` in the locals.
 *
 * @param locals - The locals data to be retrieved and updated. The `assessment_question` is expected to have been retrieved before this call, as well as any value that impacts the mustache rendering, such as `variant` and `submission`.
 */
export async function populateRubricData(locals: Record<string, any>): Promise<void> {
  // If there is no assessment question (e.g., in question preview), there is no rubric
  if (!locals.assessment_question?.manual_rubric_id) return;

  const rubric_data = await sqldb.queryOptionalRow(
    sql.select_rubric_data,
    {
      assessment_question_id: locals.assessment_question.id,
      rubric_id: locals.assessment_question.manual_rubric_id,
    },
    RubricDataSchema,
  );

  // Render rubric items: description, explanation and grader note
  const mustache_data = {
    correct_answers: locals.variant?.true_answer,
    params: locals.variant?.params,
    submitted_answers: locals.submission?.submitted_answer,
  };

  await async.eachLimit(rubric_data?.rubric_items || [], 3, async (item) => {
    item.description_rendered = (
      await markdown.processContentInline(mustache.render(item.description || '', mustache_data))
    ).toString();
    item.explanation_rendered = (
      await markdown.processContent(mustache.render(item.explanation || '', mustache_data))
    ).toString();
    item.grader_note_rendered = (
      await markdown.processContent(mustache.render(item.grader_note || '', mustache_data))
    ).toString();
  });

  locals.rubric_data = rubric_data;
}

/** Builds the locals object for rubric grading data. Can be called with any object that contains a
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
    submission.feedback_manual_html = await markdown.processContent(
      submission.feedback?.manual?.toString() || '',
    );
  }
}

/** Updates the rubric settings for an assessment question.
 *
 * @param assessment_question_id - The ID of the assessment question being updated. Assumed to be authenticated.
 * @param use_rubric - Indicates if a rubric should be used for manual grading.
 * @param replace_auto_points - If true, the rubric is used to compute the total points. If false, the rubric is used to compute the manual points.
 * @param starting_points - The points to assign to a question as a start, before rubric items are applied. Typically 0 for positive grading, or the total points for negative grading.
 * @param min_points - The minimum number of points to assign based on a rubric (floor). Computed points from rubric items are never assigned less than this, even if items bring the total to less than this value, unless an adjustment is used.
 * @param max_extra_points - The maximum number of points to assign based on a rubric beyond the question's assigned points (ceiling). Computed points from rubric items over the assigned points are never assigned more than this, even if items bring the total to more than this value, unless an adjustment is used.
 * @param rubric_items - An array of items available for grading. The `order` property is used to determine the order of the items. If an item has an `id` property that corresponds to an existing rubric item, it is updated, otherwise it is inserted.
 * @param tag_for_manual_grading - If true, tags all currently graded instance questions to be graded again using the new rubric values. If false, existing gradings are recomputed if necessary, but their grading status is retained.
 * @param authn_user_id - The user_id of the logged in user.
 */
export async function updateAssessmentQuestionRubric(
  assessment_question_id: string,
  use_rubric: boolean,
  replace_auto_points: boolean,
  starting_points: number,
  min_points: number,
  max_extra_points: number,
  rubric_items: RubricItemInput[],
  tag_for_manual_grading: boolean,
  authn_user_id: string,
): Promise<void> {
  // Basic validation: points and description must exist, description must be within size limits
  if (use_rubric) {
    if (!rubric_items?.length) {
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
          ? assessment_question.max_points ?? 0
          : assessment_question.max_manual_points ?? 0) + Number(max_extra_points);

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
        { starting_points, min_points, max_extra_points, replace_auto_points },
        IdSchema,
      );
    } else {
      // Rubric already exists, update its settings
      await sqldb.queryAsync(sql.update_rubric, {
        rubric_id: new_rubric_id,
        starting_points,
        min_points,
        max_extra_points,
        replace_auto_points,
      });
    }

    if (new_rubric_id !== current_rubric_id) {
      // Update rubric ID in assessment question
      await sqldb.queryAsync(sql.update_assessment_question_rubric_id, {
        assessment_question_id,
        manual_rubric_id: new_rubric_id,
      });
    }

    if (use_rubric) {
      // Update rubric items. Start by soft-deleting rubric items that are no longer active.
      await sqldb.queryAsync(sql.delete_rubric_items, {
        rubric_id: new_rubric_id,
        active_rubric_items: rubric_items.map((item) => item.id).filter((id) => id),
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
          const updated =
            item.id == null
              ? null
              : await sqldb.queryOptionalRow(sql.update_rubric_item, item, IdSchema);
          if (updated == null) {
            await sqldb.queryAsync(sql.insert_rubric_item, item);
          }
        },
      );

      await recomputeInstanceQuestions(assessment_question_id, authn_user_id);
    }

    if (tag_for_manual_grading) {
      await sqldb.queryAsync(sql.tag_for_manual_grading, { assessment_question_id });
    }
  });
}

/** Recomputes all graded instance questions based on changes in the rubric settings and items. A new grading job is created, but only if settings or item points are changed.
 *
 * @param assessment_question_id - The ID of the assessment question being updated. Assumed to be authenticated.
 * @param authn_user_id - The user_id of the logged in user.
 */
async function recomputeInstanceQuestions(
  assessment_question_id: string,
  authn_user_id: string,
): Promise<void> {
  await sqldb.runInTransactionAsync(async () => {
    // Recompute grades for existing instance questions using this rubric
    const instance_questions = await sqldb.queryRows(
      sql.select_instance_questions_to_update,
      { assessment_question_id, authn_user_id },
      InstanceQuestionToUpdateSchema,
    );

    await async.eachSeries(instance_questions, async (instance_question) => {
      await updateInstanceQuestionScore(
        instance_question.assessment_id,
        instance_question.instance_question_id,
        instance_question.submission_id,
        null, // check_modified_at,
        { manual_rubric_data: instance_question },
        authn_user_id,
      );
    });
  });
}

/** Creates a new grading object for a specific rubric.
 *
 * @param rubric_id - ID of the rubric (typically retrieved from the assessment question).
 * @param max_points - number of points assigned as the maximum number of points to the assessment question.
 * @param max_manual_points - number of points assigned as the maximum number of manual points to the assessment question.
 * @param rubric_items - array of items to apply to the grading.
 * @param adjust_points - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @returns The ID and points of the created rubric grading.
 */
async function insertRubricGrading(
  rubric_id: string,
  max_points: number,
  max_manual_points: number,
  rubric_items: AppliedRubricItem[],
  adjust_points: number | null,
): Promise<{ id: string; computed_points: number; replace_auto_points: boolean }> {
  return sqldb.runInTransactionAsync(async () => {
    const { rubric_data, rubric_item_data } = await sqldb.queryRow(
      sql.select_rubric_items,
      { rubric_id, rubric_items: rubric_items?.map((item) => item.rubric_item_id) || [] },
      z.object({ rubric_data: RubricSchema, rubric_item_data: z.array(RubricItemSchema) }),
    );

    const sum_rubric_item_points = sum(
      rubric_items?.map(
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
        rubric_items: JSON.stringify(rubric_items || []),
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

interface InstanceQuestionScoreInput {
  /** The manual points to assign to the instance question. */
  manual_points?: number | null;
  /** The percentage of manual points to assign to the instance question. */
  manual_score_perc?: number | null;
  /** The auto points to assign to the instance question. */
  auto_points?: number | null;
  /** The percentage of auto points to assign to the instance question. */
  auto_score_perc?: number | null;
  /** The total points to assign to the instance question. If provided, the manual points are assigned this value minus the question's auto points. */
  points?: number | null;
  /** The percentage of total points to assign to the instance question. If provided, the manual points are assigned the equivalent of points for this value minus the question's auto points. */
  score_perc?: number | null;
  /** Feedback data to be provided to the student. Freeform, though usually contains a `manual` field for markdown-based comments. */
  feedback?: Record<string, any> | null;
  /** Partial scores associated to individual elements. Must match the format accepted by individual elements. If provided, auto_points are computed based on this value. */
  partial_scores?: PartialScores | null;
  /** Rubric items associated to the grading of manual points. If provided, overrides manual points. */
  manual_rubric_data?: {
    rubric_id: string;
    applied_rubric_items?: AppliedRubricItem[] | null;
    adjust_points?: number | null;
  };
}

/** Manually updates the score of an instance question.
 * @param assessment_id - The ID of the assessment associated to the instance question. Assumed to be safe.
 * @param instance_question_id - The ID of the instance question to be updated. May or may not be safe.
 * @param submission_id - The ID of the submission. Optional, if not provided the last submission if the instance question is used.
 * @param check_modified_at - The value of modified_at when the question was retrieved, optional. If provided, and the modified_at value does not match this value, a grading job is created but the score is not updated.
 * @param score - The score values to be used for update.
 * @param authn_user_id - The user_id of the logged in user.
 * @returns The ID of the grading job created, if any, and a flag indicating if the score was not updated due to a modified_at conflict.
 */
export async function updateInstanceQuestionScore(
  assessment_id: string,
  instance_question_id: string,
  submission_id: string | null,
  check_modified_at: string | null,
  score: InstanceQuestionScoreInput,
  authn_user_id: string,
): Promise<{ grading_job_id: string | null; modified_at_conflict: boolean }> {
  return sqldb.runInTransactionAsync(async () => {
    const current_submission = await sqldb.queryRow(
      sql.select_submission_for_score_update,
      { assessment_id, instance_question_id, submission_id, check_modified_at },
      SubmissionForScoreUpdateSchema,
    );

    let new_points: number | null = null;
    let new_score_perc: number | null = null;
    let new_auto_score_perc: number | null = null;
    let new_auto_points: number | null = null;
    let new_manual_points: number | null = null;
    let manual_rubric_grading_id: string | null = null;

    if (score?.partial_scores) {
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
            (value) => (value?.score ?? 0) * (value?.weight ?? 1),
          )) /
        sumBy(Object.values(score.partial_scores), (value) => value?.weight ?? 1);
      new_auto_points = (new_auto_score_perc / 100) * (current_submission.max_auto_points ?? 0);
    }

    if (score?.auto_score_perc != null) {
      if (score?.auto_points != null) {
        throw new Error('Cannot set both auto_score_perc and auto_points');
      }
      if (score?.score_perc != null) {
        throw new Error('Cannot set both auto_score_perc and score_perc');
      }
      new_auto_score_perc = Number(score.auto_score_perc);
      new_auto_points = (new_auto_score_perc * (current_submission.max_auto_points ?? 0)) / 100;
    } else if (score?.auto_points != null) {
      if (score?.points != null) {
        throw new Error('Cannot set both auto_points and points');
      }
      new_auto_points = Number(score.auto_points);
      new_auto_score_perc =
        current_submission.max_auto_points != null && current_submission.max_auto_points > 0
          ? (new_auto_points * 100) / current_submission.max_auto_points
          : 0;
    }

    if (current_submission.manual_rubric_id && score?.manual_rubric_data?.rubric_id) {
      const manual_rubric_grading = await insertRubricGrading(
        score?.manual_rubric_data?.rubric_id,
        current_submission.max_points ?? 0,
        current_submission.max_manual_points ?? 0,
        score?.manual_rubric_data?.applied_rubric_items || [],
        score?.manual_rubric_data?.adjust_points ?? 0,
      );
      score.manual_points =
        manual_rubric_grading.computed_points -
        (manual_rubric_grading.replace_auto_points
          ? new_auto_points ?? current_submission.auto_points ?? 0
          : 0);
      score.manual_score_perc = undefined;
      manual_rubric_grading_id = manual_rubric_grading.id;
    } else if (
      current_submission.manual_rubric_id &&
      score?.points == null &&
      score?.score_perc == null &&
      score?.manual_points == null &&
      score?.manual_score_perc == null
    ) {
      // If there is a rubric, and the manual_points will not be updated, keep the current rubric grading.
      manual_rubric_grading_id = current_submission.manual_rubric_grading_id;
    } else {
      // If the manual_points will be updated and the rubric grading has not been set, clear the rubric grading.
      manual_rubric_grading_id = null;
    }

    if (score?.manual_score_perc != null) {
      if (score?.manual_points != null) {
        throw new Error('Cannot set both manual_score_perc and manual_points');
      }
      if (score?.score_perc != null) {
        throw new Error('Cannot set both manual_score_perc and score_perc');
      }
      new_manual_points =
        (Number(score.manual_score_perc) * (current_submission.max_manual_points ?? 0)) / 100;
      new_points = new_manual_points + (new_auto_points ?? current_submission.auto_points ?? 0);
      new_score_perc =
        current_submission.max_points != null && current_submission.max_points > 0
          ? (new_points * 100) / current_submission.max_points
          : 0;
    } else if (score?.manual_points != null) {
      if (score?.points != null) {
        throw new Error('Cannot set both manual_points and points');
      }
      new_manual_points = Number(score.manual_points);
      new_points = new_manual_points + (new_auto_points ?? current_submission.auto_points ?? 0);
      new_score_perc =
        current_submission.max_points != null && current_submission.max_points > 0
          ? (new_points * 100) / current_submission.max_points
          : 0;
    } else if (score?.score_perc != null) {
      if (score?.points != null) {
        throw new Error('Cannot set both score_perc and points');
      }
      new_score_perc = Number(score.score_perc);
      new_points = (new_score_perc * (current_submission.max_points ?? 0)) / 100;
      new_manual_points = new_points - (new_auto_points ?? current_submission.auto_points ?? 0);
    } else if (score?.points != null) {
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
        score?.feedback ||
        score?.partial_scores)
    ) {
      grading_job_id = await sqldb.queryRow(
        sql.insert_grading_job,
        {
          submission_id: current_submission.submission_id,
          authn_user_id,
          correct: new_auto_score_perc == null ? null : new_auto_score_perc > 50,
          score: new_score_perc == null ? null : new_score_perc / 100,
          auto_points: new_auto_points,
          manual_points: new_manual_points,
          feedback: score?.feedback,
          partial_scores: score?.partial_scores,
          manual_rubric_grading_id,
        },
        IdSchema,
      );

      if (!current_submission.modified_at_conflict && current_submission.submission_id) {
        await sqldb.queryOneRowAsync(sql.update_submission_score, {
          submission_id: current_submission.submission_id,
          feedback: score?.feedback,
          partial_scores: score?.partial_scores,
          manual_rubric_grading_id,
          score: new_auto_score_perc == null ? null : new_auto_score_perc / 100,
          correct: new_auto_score_perc == null ? null : new_auto_score_perc > 50,
        });
      }
    }

    // do the score update of the instance_question, log it, and update the assessment_instance, if we
    // have a new_score
    if (new_score_perc != null && !current_submission.modified_at_conflict) {
      await sqldb.queryAsync(sql.update_instance_question_score, {
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
      });

      await sqldb.callAsync('assessment_instances_grade', [
        current_submission.assessment_instance_id,
        authn_user_id,
        100, // credit
        false, // only_log_if_score_updated
        true, // allow_decrease
      ]);

      await ltiOutcomes.updateScoreAsync(current_submission.assessment_instance_id);
    }

    return {
      grading_job_id,
      modified_at_conflict: current_submission.modified_at_conflict,
    };
  });
}
