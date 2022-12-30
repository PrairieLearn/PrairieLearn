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

/** Builds the URL of an instance question tagged to be manually graded for a particular
 * assessment question. Only returns instance questions assigned to a particular grader.
 *
 * @params {string} urlPrefix - URL prefix for the current course instance.
 * @param {number} assessment_id - The assessment linked to the assessment question. Used to ensure the assessment is authorized, since middlewares don't authenticate assessment questions.
 * @param {number} assessment_question_id - The assessment question being graded.
 * @param {number} user_id - The user_id of the current grader. Typically the current effective user.
 * @param {number} prior_instance_question_id - The instance question previously graded. Used to ensure a consistent order if a grader starts grading from the middle of a list or skips an instance.
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

/**
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
      async.eachOfSeries(
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

      _recomputeInstanceQuestionsWithClient(
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

/**
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

  async.eachSeries(instance_questions, async (instance_question) => {
    _updateInstanceQuestionScoreWithClient(
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

/**
 */
async function insertRubricGrading(rubric_id, rubric_items, adjust_points) {
  let result;
  await sqldb.runInTransactionAsync(async (client) => {
    result = _insertRubricGradingWithClient(client, rubric_id, rubric_items, adjust_points);
  });
  return result;
}

/**
 */
async function _insertRubricGradingWithClient(client, rubric_id, rubric_items, adjust_points) {
  const { rubric_data, rubric_item_data } = (
    await sqldb.queryWithClientOneRowAsync(client, sql.select_rubric_items, {
      rubric_id,
      rubric_items: rubric_items.map((item) => item.rubric_item_id),
    })
  ).rows[0];

  const sum_rubric_item_points = _.sum(
    rubric_items.map(
      (item) =>
        (item.score ?? 1) *
        (rubric_item_data.find((db_item) => idsEqual(db_item.id, item.rubric_item_id))?.points ?? 0)
    )
  );
  const computed_points = Math.min(
    Math.max(
      rubric_data.starting_points + sum_rubric_item_points + (adjust_points || 0),
      rubric_data.min_points
    ),
    rubric_data.max_points
  );

  const rubric_grading_result = (
    await sqldb.queryWithClientOneRowAsync(client, sql.insert_rubric_grading, {
      rubric_id,
      computed_points,
      adjust_points: adjust_points || 0,
      rubric_items: JSON.stringify(rubric_items),
    })
  ).rows[0];

  return rubric_grading_result.id;
}

/**
 */
async function updateInstanceQuestionScore(
  assessment_id,
  instance_question_id,
  submission_id,
  check_modified_at,
  score,
  authn_user_id
) {
  let result;
  await sqldb.runInTransactionAsync(async (client) => {
    result = _updateInstanceQuestionScoreWithClient(
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

/**
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
  const manual_rubric_grading_id = score?.manual_rubric_data
    ? await _insertRubricGradingWithClient(
        client,
        score.manual_rubric_data.rubric_id,
        score.manual_rubric_data.applied_rubric_items,
        score.manual_rubric_data.adjust_points
      )
    : null;
  const auto_rubric_grading_id = score?.auto_rubric_data
    ? await _insertRubricGradingWithClient(
        client,
        score.auto_rubric_data.rubric_id,
        score.auto_rubric_data.applied_rubric_items,
        score.auto_rubric_data.adjust_points
      )
    : null;

  const params = [
    assessment_id,
    submission_id,
    instance_question_id,
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
