// @ts-check

const async = require('async');
const mustache = require('mustache');
const util = require('util');
const _ = require('lodash');

const { idsEqual } = require('./id');
const markdown = require('./markdown');
const ltiOutcomes = require('./ltiOutcomes');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

/**
 * @typedef {Object} AppliedRubricItem
 * @property {number} rubric_item_id - ID of the rubric item to be applied.
 * @property {number} [score=1] - Score to be applied to the rubric item. Defaults to 1 (100%), i.e., uses the full points assigned to the rubric item.
 * @property {string} [note] - Note to be applied to the rubric item, optional.
 */

/** Builds the URL of an instance question tagged to be manually graded for a particular
 * assessment question. Only returns instance questions assigned to a particular grader.
 *
 * @param {string} urlPrefix - URL prefix for the current course instance.
 * @param {number} assessment_id - The assessment linked to the assessment question. Used to ensure the assessment is authorized, since middlewares don't authenticate assessment questions.
 * @param {number} assessment_question_id - The assessment question being graded.
 * @param {number} user_id - The user_id of the current grader. Typically the current effective user.
 * @param {number} prior_instance_question_id - The instance question previously graded. Used to ensure a consistent order if a grader starts grading from the middle of a list or skips an instance.
 * @returns {Promise<string>}
 */
async function nextUngradedInstanceQuestionUrl(
  urlPrefix,
  assessment_id,
  assessment_question_id,
  user_id,
  prior_instance_question_id
) {
  const params = {
    assessment_id,
    assessment_question_id,
    user_id,
    prior_instance_question_id,
  };
  const result = await sqldb.queryZeroOrOneRowAsync(
    sql.select_next_ungraded_instance_question,
    params
  );

  if (result.rowCount > 0) {
    const instance_question_id = result.rows[0].id;
    return `${urlPrefix}/assessment/${assessment_id}/manual_grading/instance_question/${instance_question_id}`;
  }
  // If we have no more submissions, then redirect back to manual grading page
  return `${urlPrefix}/assessment/${assessment_id}/manual_grading/assessment_question/${assessment_question_id}`;
}

/** Builds the locals object for rubric data. Will typically be called twice for an instance
 * question: once for manual grading, and once for auto grading. Returns an object that is to be
 * assigned to `XXX_rubric_data` in locals.
 *
 * @param {number} assessment_question_id - The assessment question associated to the rubric. Used to obtain the number of submissions associated to each rubric item.
 * @param {number} rubric_id - The rubric being selected. Will typically be either manual_rubric_id or auto_rubric_id in the assessment question.
 * @param {number} rubric_grading_id - The rubric grading being selected. Will typically be either manual_rubric_grading_id or auto_rubric_grading_id in the instance question.
 * @param {Object} mustache_data - The data to be used to render mustache tags.
 * @returns {Promise<Object>}
 */
async function selectRubricGradingData(
  assessment_question_id,
  rubric_id,
  rubric_grading_id,
  mustache_data
) {
  if (!rubric_id) {
    return null;
  }
  const params = {
    assessment_question_id,
    rubric_id,
    rubric_grading_id,
  };
  const rubric_data = (await sqldb.queryZeroOrOneRowAsync(sql.select_rubric_data, params)).rows[0];

  // Render rubric items: text, description and instructions
  await async.eachLimit(rubric_data.rubric_items || [], 3, async (item) => {
    item.rubric_item.short_text_rendered = await markdown.processContentInline(
      mustache.render(item.rubric_item.short_text || '', mustache_data)
    );
    item.rubric_item.staff_instructions_rendered = await markdown.processContent(
      mustache.render(item.rubric_item.staff_instructions || '', mustache_data)
    );
    item.rubric_item.description_rendered = await markdown.processContent(
      mustache.render(item.rubric_item.description || '', mustache_data)
    );
  });

  return rubric_data;
}

/** Updates the rubric settings for an assessment question. Updates either the manual settings or
 * the auto settings separately, to update both it must be called twice.
 *
 * @param {number} assessment_question_id - The ID of the assessment question being updated. Assumed to be authenticated.
 * @param {string} rubric_type - Either 'manual' or 'auto', indicates which settings to update.
 * @param {boolean} use_rubrics - Indicates if rubrics should be used for this grading component.
 * @param {number} starting_points - The points to assign to a question as a start, before rubric items are applied. Typically 0 for positive grading, or the total points for negative grading.
 * @param {number} min_points - The minimum number of points to assign based on a rubric (floor). Computed points are never assigned less than this, even if items bring the total to less than this value.
 * @param {number} max_points - The maximum number of points to assign based on a rubric (ceiling). Computed points are never assigned more than this, even if items bring the total to more than this value.
 * @param {Object[]} rubric_items - An array of items available for grading.
 * @param {number} [rubric_items[].id] - The ID of the rubric item, if an existing item already exists and should be modified. Should be ignored or set to null if a new item is to be created.
 * @param {number} rubric_items[].points - The number of points assigned to the rubric item.
 * @param {string} rubric_items[].short_text - A short text describing the rubric item. Visible to graders and students.
 * @param {string} [rubric_items[].description] - A longer description of the rubric item. Visible to graders and students.
 * @param {string} [rubric_items[].staff_instructions] - A longer description of the rubric item. Visible to graders only.
 * @param {number} rubric_items[].order - An indicator of the order in which items are to be presented.
 * @param {boolean} tag_for_manual_grading - If true, tags all currently graded instance questions to be graded again using the new rubric values. If false, existing gradings are recomputed if necessary, but their grading status is retained.
 * @param {number} authn_user_id - The user_id of the logged in user.
 */
async function updateAssessmentQuestionRubric(
  assessment_question_id,
  rubric_type,
  use_rubrics,
  starting_points,
  min_points,
  max_points,
  rubric_items,
  tag_for_manual_grading,
  authn_user_id
) {
  // Basic validation: points and short text must exist, short text must be within size limits
  if (use_rubrics) {
    (rubric_items ?? []).forEach((item) => {
      if (item.points === null) {
        throw new Error('Rubric item provided without a points value.');
      }
      if (item.short_text === null || item.short_text === '') {
        throw new Error('Rubric item provided without a text.');
      }
      if (item.short_text.length > 100) {
        throw new Error(
          'Rubric item short text is too long, must be no longer than 100 characters. Use the description for further explanation.'
        );
      }
    });
  }

  await sqldb.runInTransactionAsync(async (client) => {
    const assessment_question = (
      await sqldb.queryWithClientOneRowAsync(client, sql.select_assessment_question_for_update, {
        assessment_question_id,
      })
    ).rows[0];

    const current_rubric_id =
      rubric_type === 'auto'
        ? assessment_question.auto_rubric_id
        : assessment_question.manual_rubric_id;
    let new_rubric_id = current_rubric_id;

    if (!use_rubrics) {
      // Rubric exists, but should not exist, remove
      new_rubric_id = null;
    } else if (current_rubric_id === null) {
      // Rubric does not exist yet, but should, insert new rubric
      new_rubric_id = (
        await sqldb.queryWithClientOneRowAsync(client, sql.insert_rubric, {
          starting_points,
          min_points,
          max_points,
        })
      ).rows[0].id;
    } else {
      // Rubric already exists, update its settings
      await sqldb.queryWithClientAsync(client, sql.update_rubric, {
        rubric_id: new_rubric_id,
        starting_points,
        min_points,
        max_points,
      });
    }

    if (new_rubric_id !== current_rubric_id) {
      // Update rubric ID in assessment question
      await sqldb.queryWithClientAsync(client, sql.update_assessment_question_rubric_id, {
        assessment_question_id,
        manual_rubric_id:
          rubric_type === 'auto' ? assessment_question.manual_rubric_id : new_rubric_id,
        auto_rubric_id: rubric_type === 'auto' ? new_rubric_id : assessment_question.auto_rubric_id,
      });
    }

    if (use_rubrics) {
      // Update rubric items. Start by soft-deleting rubric items that are no longer active.
      await sqldb.queryWithClientAsync(client, sql.delete_rubric_items, {
        rubric_id: new_rubric_id,
        active_rubric_items: rubric_items.map((item) => item.id).filter((id) => id),
      });

      rubric_items.sort((a, b) => a.order - b.order);
      await async.eachOfSeries(
        rubric_items.map((item) => ({
          // Set default values to ensure fields exist, will be overridden by the spread
          id: null,
          points: null,
          short_text: null,
          description: null,
          staff_instructions: null,
          ...item,
        })),
        async (item, number) => {
          // Attempt to update the rubric item based on the ID. If the ID is not set or does not
          // exist, insert a new rubric item.
          const updated =
            item.id === null
              ? null
              : await sqldb.queryWithClientZeroOrOneRowAsync(client, sql.update_rubric_item, {
                  ...item,
                  rubric_id: new_rubric_id,
                  number,
                });
          if (!updated?.rowCount) {
            await sqldb.queryWithClientAsync(client, sql.insert_rubric_item, {
              ...item,
              rubric_id: new_rubric_id,
              number,
            });
          }
        }
      );

      await _recomputeInstanceQuestionsWithClient(
        client,
        assessment_question_id,
        rubric_type,
        authn_user_id
      );
    }

    if (tag_for_manual_grading) {
      await sqldb.queryWithClientAsync(client, sql.tag_for_manual_grading, {
        assessment_question_id,
      });
    }
  });
}

/** Recomputes all graded instance questions based on changes in the rubric settings and items. A new grading job is created, but only if settings or item points are changed.
 *
 * @param {import("pg").PoolClient} client - The client (transaction) with which to execute the queries.
 * @param {number} assessment_question_id - The ID of the assessment question being updated. Assumed to be authenticated.
 * @param {string} rubric_type - Either 'manual' or 'auto', indicates which settings to update.
 * @param {number} authn_user_id - The user_id of the logged in user.
 */
async function _recomputeInstanceQuestionsWithClient(
  client,
  assessment_question_id,
  rubric_type,
  authn_user_id
) {
  // Recompute grades for existing instance questions using this rubric
  const instance_questions = (
    await sqldb.queryWithClientAsync(client, sql.select_instance_questions_to_update, {
      assessment_question_id,
      rubric_type,
      authn_user_id,
    })
  ).rows;

  await async.eachSeries(instance_questions, async (instance_question) => {
    await _updateInstanceQuestionScoreWithClient(
      client,
      instance_question.assessment_id,
      instance_question.instance_question_id,
      null, // submission_id,
      null, // check_modified_at,
      {
        manual_rubric_data: rubric_type === 'auto' ? null : instance_question,
        auto_rubric_data: rubric_type === 'auto' ? instance_question : null,
      },
      authn_user_id
    );
  });
}

/** Creates a new grading object for a specific rubric.
 *
 * @param {number} rubric_id - ID of the rubric (typically retrieved from the assessment question).
 * @param {AppliedRubricItem[]} rubric_items - array of items to apply to the grading.
 * @param {number | string} [adjust_points=0] - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @returns {Promise<number>} The ID of the created rubric grading.
 */
async function insertRubricGrading(rubric_id, rubric_items, adjust_points) {
  if (!rubric_id) {
    return null;
  }

  /** @type {number} */
  let result;
  await sqldb.runInTransactionAsync(async (client) => {
    result = await _insertRubricGradingWithClient(client, rubric_id, rubric_items, adjust_points);
  });
  return result;
}

/** Creates a new grading object for a specific rubric. To be called if a transaction is already held.
 *
 * @param {import("pg").PoolClient} client - The client (transaction) with which to execute the queries.
 * @param {number} rubric_id - ID of the rubric (typically retrieved from the assessment question).
 * @param {AppliedRubricItem[]} rubric_items - array of items to apply to the grading.
 * @param {number | string} [adjust_points=0] - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @returns {Promise<number>} The ID of the created rubric grading.
 */
async function _insertRubricGradingWithClient(client, rubric_id, rubric_items, adjust_points) {
  if (!rubric_id) {
    return null;
  }

  const { rubric_data, rubric_item_data } = (
    await sqldb.queryWithClientOneRowAsync(client, sql.select_rubric_items, {
      rubric_id,
      rubric_items: rubric_items?.map((item) => item.rubric_item_id) || [],
    })
  ).rows[0];

  const sum_rubric_item_points = _.sum(
    rubric_items?.map(
      (item) =>
        (item.score ?? 1) *
        (rubric_item_data.find((db_item) => idsEqual(db_item.id, item.rubric_item_id))?.points ?? 0)
    )
  );
  const computed_points = Math.min(
    Math.max(
      rubric_data.starting_points + sum_rubric_item_points + Number(adjust_points || 0),
      rubric_data.min_points
    ),
    rubric_data.max_points
  );

  const rubric_grading_result = (
    await sqldb.queryWithClientOneRowAsync(client, sql.insert_rubric_grading, {
      rubric_id,
      computed_points,
      adjust_points: adjust_points || 0,
      rubric_items: JSON.stringify(rubric_items || []),
    })
  ).rows[0];

  return rubric_grading_result.id;
}

/** Manually updates the score of an instance question.
 * @param {number} assessment_id - The ID of the assessment associated to the instance question. Assumed to be safe.
 * @param {number} instance_question_id - The ID of the instance question to be updated. May or may not be safe.
 * @param {number|null} submission_id - The ID of the submission. Optional, if not provided the last submission if the instance question is used.
 * @param {string|null} check_modified_at - The value of modified_at when the question was retrieved, optional. If provided, and the modified_at value does not match this value, a grading job is created but the score is not updated.
 * @param {Object} score - The score values to be used for update.
 * @param {number} [score.manual_points] - The manual points to assign to the instance question.
 * @param {number} [score.manual_score_perc] - The percentage of manual points to assign to the instance question.
 * @param {number} [score.auto_points] - The auto points to assign to the instance question.
 * @param {number} [score.auto_score_perc] - The percentage of auto points to assign to the instance question.
 * @param {number} [score.points] - The total points to assign to the instance question. If provided, the manual points are assigned this value minus the question's auto points.
 * @param {number} [score.score_perc] - The percentage of total points to assign to the instance question. If provided, the manual points are assigned the equivalent of points for this value minus the question's auto points.
 * @param {Object} [score.feedback] - Feedback data to be provided to the student. Freeform, though usually contains a `manual` field for markdown-based comments.
 * @param {Object} [score.partial_scores] - Partial scores associated to individual elements. Must match the format accepted by individual elements. If provided, auto_points are computed based on this value.
 * @param {Object} [score.manual_rubric_data] - Rubric items associated to the grading of manual points. If provided, overrides manual points.
 * @param {Object} [score.manual_rubric_data.rubric_id] - Rubric ID to use for manual grading.
 * @param {AppliedRubricItem[]} [score.manual_rubric_data.applied_rubric_items] - Applied rubric items.
 * @param {number | string} [score.manual_rubric_data.adjust_points=0] - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @param {Object} [score.auto_rubric_data] - Rubric items associated to the grading of auto points. If provided, overrides auto points.
 * @param {Object} [score.auto_rubric_data.rubric_id] - Rubric ID to use for auto grading.
 * @param {AppliedRubricItem[]} [score.auto_rubric_data.applied_rubric_items] - Applied rubric items.
 * @param {number | string} [score.auto_rubric_data.adjust_points=0] - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @param {number} authn_user_id - The user_id of the logged in user.
 * @returns {Promise<Object>}
 */
async function updateInstanceQuestionScore(
  assessment_id,
  instance_question_id,
  submission_id,
  check_modified_at,
  score,
  authn_user_id
) {
  /** @type Object */
  let result;
  await sqldb.runInTransactionAsync(async (client) => {
    result = await _updateInstanceQuestionScoreWithClient(
      client,
      assessment_id,
      instance_question_id,
      submission_id,
      check_modified_at,
      score,
      authn_user_id
    );
  });
  return result;
}

/** Manually updates the score of an instance question. To be called if a transaction is already held.
 * @param {import("pg").PoolClient} client - The client (transaction) with which to execute the queries.
 * @param {number} assessment_id - The ID of the assessment associated to the instance question. Assumed to be safe.
 * @param {number} instance_question_id - The ID of the instance question to be updated. May or may not be safe.
 * @param {number|null} submission_id - The ID of the submission. Optional, if not provided the last submission if the instance question is used.
 * @param {string|null} check_modified_at - The value of modified_at when the question was retrieved, optional. If provided, and the modified_at value does not match this value, a grading job is created but the score is not updated.
 * @param {Object} score - The score values to be used for update.
 * @param {number} [score.manual_points] - The manual points to assign to the instance question.
 * @param {number} [score.manual_score_perc] - The percentage of manual points to assign to the instance question.
 * @param {number} [score.auto_points] - The auto points to assign to the instance question.
 * @param {number} [score.auto_score_perc] - The percentage of auto points to assign to the instance question.
 * @param {number} [score.points] - The total points to assign to the instance question. If provided, the manual points are assigned this value minus the question's auto points.
 * @param {number} [score.score_perc] - The percentage of total points to assign to the instance question. If provided, the manual points are assigned the equivalent of points for this value minus the question's auto points.
 * @param {Object} [score.feedback] - Feedback data to be provided to the student. Freeform, though usually contains a `manual` field for markdown-based comments.
 * @param {Object} [score.partial_scores] - Partial scores associated to individual elements. Must match the format accepted by individual elements. If provided, auto_points are computed based on this value.
 * @param {Object} [score.manual_rubric_data] - Rubric items associated to the grading of manual points. If provided, overrides manual points.
 * @param {Object} [score.manual_rubric_data.rubric_id] - Rubric ID to use for manual grading.
 * @param {number | string} [score.manual_rubric_data.adjust_points=0] - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @param {AppliedRubricItem[]} [score.manual_rubric_data.applied_rubric_items] - Applied rubric items.
 * @param {Object} [score.auto_rubric_data] - Rubric items associated to the grading of auto points. If provided, overrides auto points.
 * @param {Object} [score.auto_rubric_data.rubric_id] - Rubric ID to use for auto grading.
 * @param {number | string} [score.auto_rubric_data.adjust_points=0] - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @param {AppliedRubricItem[]} [score.auto_rubric_data.applied_rubric_items] - Applied rubric items.
 * @param {number} authn_user_id - The user_id of the logged in user.
 * @returns {Promise<Object>}
 */
async function _updateInstanceQuestionScoreWithClient(
  client,
  assessment_id,
  instance_question_id,
  submission_id,
  check_modified_at,
  score,
  authn_user_id
) {
  const manual_rubric_grading_id = await _insertRubricGradingWithClient(
    client,
    score?.manual_rubric_data?.rubric_id,
    score?.manual_rubric_data?.applied_rubric_items,
    score?.manual_rubric_data?.adjust_points
  );

  const auto_rubric_grading_id = await _insertRubricGradingWithClient(
    client,
    score?.auto_rubric_data?.rubric_id,
    score?.auto_rubric_data?.applied_rubric_items,
    score?.auto_rubric_data?.adjust_points
  );

  const params = [
    assessment_id,
    instance_question_id,
    submission_id,
    check_modified_at,
    score?.score_perc,
    score?.points,
    score?.manual_score_perc,
    score?.manual_points,
    score?.auto_score_perc,
    score?.auto_points,
    score?.feedback,
    score?.partial_scores,
    manual_rubric_grading_id,
    auto_rubric_grading_id,
    authn_user_id,
  ];
  const update_result = (
    await sqldb.callWithClientAsync(client, 'instance_questions_update_score', params)
  ).rows[0];

  if (!update_result.modified_at_conflict) {
    await util.promisify(ltiOutcomes.updateScore)(update_result.assessment_instance_id);
  }

  return update_result;
}

module.exports = {
  nextUngradedInstanceQuestionUrl,
  selectRubricGradingData,
  updateAssessmentQuestionRubric,
  insertRubricGrading,
  updateInstanceQuestionScore,
};
