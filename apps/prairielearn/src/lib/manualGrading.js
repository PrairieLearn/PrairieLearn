// @ts-check

const async = require('async');
const mustache = require('mustache');
const _ = require('lodash');

const { idsEqual } = require('./id');
const markdown = require('./markdown');
const ltiOutcomes = require('./ltiOutcomes');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

/**
 * @typedef {Object} AppliedRubricItem
 * @property {number} rubric_item_id - ID of the rubric item to be applied.
 * @property {number} [score=1] - Score to be applied to the rubric item. Defaults to 1 (100%), i.e., uses the full points assigned to the rubric item.
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
  prior_instance_question_id,
) {
  const params = {
    assessment_id,
    assessment_question_id,
    user_id,
    prior_instance_question_id,
  };
  const result = await sqldb.queryZeroOrOneRowAsync(
    sql.select_next_ungraded_instance_question,
    params,
  );

  if (result.rowCount > 0) {
    const instance_question_id = result.rows[0].id;
    return `${urlPrefix}/assessment/${assessment_id}/manual_grading/instance_question/${instance_question_id}`;
  }
  // If we have no more submissions, then redirect back to manual grading page
  return `${urlPrefix}/assessment/${assessment_id}/manual_grading/assessment_question/${assessment_question_id}`;
}

/** Populates the locals objects for rubric data. Assigns values to `rubric_data` in the locals.
 *
 * @param {Object} locals - The locals data to be retrieved and updated. The `assessment_question` is expected to have been retrieved before this call, as well as any value that impacts the mustache rendering, such as `variant` and `submission`.
 * @returns {Promise<void>}
 */
async function populateRubricData(locals) {
  // If there is no assessment question (e.g., in question preview), there is no rubric
  if (!locals.assessment_question) return;

  if (locals.assessment_question.manual_rubric_id) {
    locals.rubric_data = (
      await sqldb.queryZeroOrOneRowAsync(sql.select_rubric_data, {
        assessment_question_id: locals.assessment_question.id,
        rubric_id: locals.assessment_question.manual_rubric_id,
      })
    ).rows[0];
  }

  // Render rubric items: description, explanation and grader note
  const mustache_data = {
    correct_answers: locals.variant?.true_answer,
    params: locals.variant?.params,
    submitted_answers: locals.submission?.submitted_answer,
  };

  await async.eachLimit(locals.rubric_data?.rubric_items || [], 3, async (item) => {
    item.description_rendered = await markdown.processContentInline(
      mustache.render(item.description || '', mustache_data),
    );
    item.explanation_rendered = await markdown.processContent(
      mustache.render(item.explanation || '', mustache_data),
    );
    item.grader_note_rendered = await markdown.processContent(
      mustache.render(item.grader_note || '', mustache_data),
    );
  });
}

/** Builds the locals object for rubric grading data. Can be called with any object that contains a
 * `manual_rubric_grading_id` field, typically a submission or grading job. Updates the object
 * in-place by adding a `rubric_grading` value, as well as the rendered version of the manual
 * feedback.
 *
 * @param {Object} submission - The object whose rubric grading must be retrieved and populated. Typically a submission or grading job.
 * @returns {Promise<void>}
 */
async function populateManualGradingData(submission) {
  if (submission.manual_rubric_grading_id) {
    submission.rubric_grading = (
      await sqldb.queryZeroOrOneRowAsync(sql.select_rubric_grading_data, {
        rubric_grading_id: submission.manual_rubric_grading_id,
      })
    ).rows[0];
  }
  if (submission.feedback?.manual) {
    submission.feedback_manual_html = await markdown.processContent(
      submission.feedback?.manual?.toString() || '',
    );
  }
}

/** Updates the rubric settings for an assessment question.
 *
 * @param {string} assessment_question_id - The ID of the assessment question being updated. Assumed to be authenticated.
 * @param {boolean} use_rubric - Indicates if a rubric should be used for manual grading.
 * @param {number} starting_points - The points to assign to a question as a start, before rubric items are applied. Typically 0 for positive grading, or the total points for negative grading.
 * @param {number} min_points - The minimum number of points to assign based on a rubric (floor). Computed points from rubric items are never assigned less than this, even if items bring the total to less than this value, unless an adjustment is used.
 * @param {number} max_extra_points - The maximum number of points to assign based on a rubric beyond the question's assigned points (ceiling). Computed points from rubric items over the assigned points are never assigned more than this, even if items bring the total to more than this value, unless an adjustment is used.
 * @param {Object[]} rubric_items - An array of items available for grading.
 * @param {string} [rubric_items[].id] - The ID of the rubric item, if an existing item already exists and should be modified. Should be ignored or set to null if a new item is to be created.
 * @param {number} rubric_items[].points - The number of points assigned to the rubric item.
 * @param {string} rubric_items[].description - A short text describing the rubric item. Visible to graders and students.
 * @param {string} [rubric_items[].explanation] - A longer explanation of the rubric item. Visible to graders and students.
 * @param {string} [rubric_items[].grader_note] - A note associated to the rubric item that is visible to graders only.
 * @param {number} rubric_items[].order - An indicator of the order in which items are to be presented.
 * @param {boolean} rubric_items[].always_show_to_students - If the rubric item should be shown to students when not applied.
 * @param {boolean} tag_for_manual_grading - If true, tags all currently graded instance questions to be graded again using the new rubric values. If false, existing gradings are recomputed if necessary, but their grading status is retained.
 * @param {string} authn_user_id - The user_id of the logged in user.
 */
async function updateAssessmentQuestionRubric(
  assessment_question_id,
  use_rubric,
  replace_auto_points,
  starting_points,
  min_points,
  max_extra_points,
  rubric_items,
  tag_for_manual_grading,
  authn_user_id,
) {
  // Basic validation: points and description must exist, description must be within size limits
  if (use_rubric) {
    if (!rubric_items?.length) {
      throw new Error('No rubric items were provided.');
    }

    rubric_items.forEach((item) => {
      if (item.points === null) {
        throw new Error('Rubric item provided without a points value.');
      }
      if (item.description === null || item.description === '') {
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
    const assessment_question = (
      await sqldb.queryOneRowAsync(sql.select_assessment_question_for_update, {
        assessment_question_id,
      })
    ).rows[0];

    if (use_rubric) {
      const max_points =
        (replace_auto_points
          ? assessment_question.max_points
          : assessment_question.max_manual_points) + Number(max_extra_points);

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
      new_rubric_id = (
        await sqldb.queryOneRowAsync(sql.insert_rubric, {
          starting_points,
          min_points,
          max_extra_points,
          replace_auto_points,
        })
      ).rows[0].id;
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
        rubric_items.map((item) => ({
          // Set default values to ensure fields exist, will be overridden by the spread
          id: null,
          explanation: null,
          grader_note: null,
          ...item,
        })),
        async (item, number) => {
          // Attempt to update the rubric item based on the ID. If the ID is not set or does not
          // exist, insert a new rubric item.
          const updated =
            item.id === null
              ? null
              : await sqldb.queryZeroOrOneRowAsync(sql.update_rubric_item, {
                  ...item,
                  rubric_id: new_rubric_id,
                  number,
                });
          if (!updated?.rowCount) {
            await sqldb.queryAsync(sql.insert_rubric_item, {
              ...item,
              rubric_id: new_rubric_id,
              number,
            });
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
 * @param {string} assessment_question_id - The ID of the assessment question being updated. Assumed to be authenticated.
 * @param {string} authn_user_id - The user_id of the logged in user.
 */
async function recomputeInstanceQuestions(assessment_question_id, authn_user_id) {
  await sqldb.runInTransactionAsync(async () => {
    // Recompute grades for existing instance questions using this rubric
    const instance_questions = (
      await sqldb.queryAsync(sql.select_instance_questions_to_update, {
        assessment_question_id,
        authn_user_id,
      })
    ).rows;

    await async.eachSeries(instance_questions, async (instance_question) => {
      await updateInstanceQuestionScore(
        instance_question.assessment_id,
        instance_question.instance_question_id,
        instance_question.submission_id,
        null, // check_modified_at,
        {
          manual_rubric_data: instance_question,
        },
        authn_user_id,
      );
    });
  });
}

/** Creates a new grading object for a specific rubric.
 *
 * @param {number} rubric_id - ID of the rubric (typically retrieved from the assessment question).
 * @param {number} max_points - number of points assigned as the maximum number of points to the assessment question.
 * @param {number} max_manual_points - number of points assigned as the maximum number of manual points to the assessment question.
 * @param {AppliedRubricItem[]} rubric_items - array of items to apply to the grading.
 * @param {number | string} [adjust_points=0] - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @returns {Promise<{id: number, computed_points: number, replace_auto_points: boolean}>} The ID and points of the created rubric grading.
 */
async function insertRubricGrading(
  rubric_id,
  max_points,
  max_manual_points,
  rubric_items,
  adjust_points,
) {
  return sqldb.runInTransactionAsync(async () => {
    const { rubric_data, rubric_item_data } = (
      await sqldb.queryOneRowAsync(sql.select_rubric_items, {
        rubric_id,
        rubric_items: rubric_items?.map((item) => item.rubric_item_id) || [],
      })
    ).rows[0];

    const sum_rubric_item_points = _.sum(
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

    const rubric_grading_result = (
      await sqldb.queryOneRowAsync(sql.insert_rubric_grading, {
        rubric_id,
        computed_points,
        adjust_points: adjust_points || 0,
        rubric_items: JSON.stringify(rubric_items || []),
      })
    ).rows[0];

    return {
      id: rubric_grading_result.id,
      computed_points,
      replace_auto_points: rubric_data.replace_auto_points,
    };
  });
}

/** Manually updates the score of an instance question.
 * @param {string} assessment_id - The ID of the assessment associated to the instance question. Assumed to be safe.
 * @param {string} instance_question_id - The ID of the instance question to be updated. May or may not be safe.
 * @param {string|null} submission_id - The ID of the submission. Optional, if not provided the last submission if the instance question is used.
 * @param {string|null} check_modified_at - The value of modified_at when the question was retrieved, optional. If provided, and the modified_at value does not match this value, a grading job is created but the score is not updated.
 * @param {Object} score - The score values to be used for update.
 * @param {number|string|null} [score.manual_points] - The manual points to assign to the instance question.
 * @param {number|string|null} [score.manual_score_perc] - The percentage of manual points to assign to the instance question.
 * @param {number|string|null} [score.auto_points] - The auto points to assign to the instance question.
 * @param {number|string|null} [score.auto_score_perc] - The percentage of auto points to assign to the instance question.
 * @param {number|string|null} [score.points] - The total points to assign to the instance question. If provided, the manual points are assigned this value minus the question's auto points.
 * @param {number|string|null} [score.score_perc] - The percentage of total points to assign to the instance question. If provided, the manual points are assigned the equivalent of points for this value minus the question's auto points.
 * @param {Object|null} [score.feedback] - Feedback data to be provided to the student. Freeform, though usually contains a `manual` field for markdown-based comments.
 * @param {Object|null} [score.partial_scores] - Partial scores associated to individual elements. Must match the format accepted by individual elements. If provided, auto_points are computed based on this value.
 * @param {Object} [score.manual_rubric_data] - Rubric items associated to the grading of manual points. If provided, overrides manual points.
 * @param {Object} [score.manual_rubric_data.rubric_id] - Rubric ID to use for manual grading.
 * @param {AppliedRubricItem[]} [score.manual_rubric_data.applied_rubric_items] - Applied rubric items.
 * @param {number | string} [score.manual_rubric_data.adjust_points=0] - number of points to add (positive) or subtract (negative) from the total computed from the items.
 * @param {string} authn_user_id - The user_id of the logged in user.
 * @returns {Promise<Object>}
 */
async function updateInstanceQuestionScore(
  assessment_id,
  instance_question_id,
  submission_id,
  check_modified_at,
  score,
  authn_user_id,
) {
  return sqldb.runInTransactionAsync(async () => {
    const current_submission = (
      await sqldb.queryOneRowAsync(sql.select_submission_for_score_update, {
        assessment_id,
        instance_question_id,
        submission_id,
        check_modified_at,
      })
    ).rows[0];

    let new_points = null;
    let new_score_perc = null;
    let new_auto_score_perc = null;
    let new_auto_points = null;
    let new_manual_points = null;

    if (score?.partial_scores) {
      if (typeof score.partial_scores !== 'object') {
        throw new Error('partial_scores is not an object');
      }
      if (current_submission.partial_scores) {
        score.partial_scores = { ...current_submission.partial_scores, ...score.partial_scores };
      }
      new_auto_score_perc =
        (100 *
          _.sumBy(
            _.toPairs(score.partial_scores),
            ([_, value]) => (value?.score ?? 0) * (value?.weight ?? 1),
          )) /
        _.sumBy(_.toPairs(score.partial_scores), ([_, value]) => value?.weight ?? 1);
      new_auto_points = (new_auto_score_perc / 100) * current_submission.max_auto_points;
    }

    if (score?.auto_score_perc != null) {
      if (score?.auto_points != null) {
        throw new Error('Cannot set both auto_score_perc and auto_points');
      }
      if (score?.score_perc != null) {
        throw new Error('Cannot set both auto_score_perc and score_perc');
      }
      new_auto_score_perc = Number(score.auto_score_perc);
      new_auto_points = (new_auto_score_perc * current_submission.max_auto_points) / 100;
    } else if (score?.auto_points != null) {
      if (score?.points != null) {
        throw new Error('Cannot set both auto_points and points');
      }
      new_auto_points = Number(score.auto_points);
      new_auto_score_perc =
        current_submission.max_auto_points > 0
          ? (new_auto_points * 100) / current_submission.max_auto_points
          : 0;
    }

    let manual_rubric_grading;

    if (current_submission.manual_rubric_id && score?.manual_rubric_data?.rubric_id) {
      manual_rubric_grading = await insertRubricGrading(
        score?.manual_rubric_data?.rubric_id,
        current_submission.max_points,
        current_submission.max_manual_points,
        score?.manual_rubric_data?.applied_rubric_items || [],
        score?.manual_rubric_data?.adjust_points,
      );
      score.manual_points =
        manual_rubric_grading.computed_points -
        (manual_rubric_grading.replace_auto_points
          ? new_auto_points ?? current_submission.auto_points ?? 0
          : 0);
      score.manual_score_perc = undefined;
    } else if (
      current_submission.manual_rubric_id &&
      score?.points == null &&
      score?.score_perc == null &&
      score?.manual_points == null &&
      score?.manual_score_perc == null
    ) {
      // If there is a rubric, and the manual_points will not be updated, keep the current rubric grading.
      manual_rubric_grading = { id: current_submission.manual_rubric_grading_id };
    } else {
      // If the manual_points will be updated and the rubric grading has not been set, clear the rubric grading.
      manual_rubric_grading = null;
    }

    if (score?.manual_score_perc != null) {
      if (score?.manual_points != null) {
        throw new Error('Cannot set both manual_score_perc and manual_points');
      }
      if (score?.score_perc != null) {
        throw new Error('Cannot set both manual_score_perc and score_perc');
      }
      new_manual_points =
        (Number(score.manual_score_perc) * current_submission.max_manual_points) / 100;
      new_points = new_manual_points + (new_auto_points ?? current_submission.auto_points);
      new_score_perc =
        current_submission.max_points > 0 ? (new_points * 100) / current_submission.max_points : 0;
    } else if (score?.manual_points != null) {
      if (score?.points != null) {
        throw new Error('Cannot set both manual_points and points');
      }
      new_manual_points = Number(score.manual_points);
      new_points = new_manual_points + (new_auto_points ?? current_submission.auto_points ?? 0);
      new_score_perc =
        current_submission.max_points > 0 ? (new_points * 100) / current_submission.max_points : 0;
    } else if (score?.score_perc != null) {
      if (score?.points != null) {
        throw new Error('Cannot set both score_perc and points');
      }
      new_score_perc = Number(score.score_perc);
      new_points = (new_score_perc * current_submission.max_points) / 100;
      new_manual_points = new_points - (new_auto_points ?? current_submission.auto_points ?? 0);
    } else if (score?.points != null) {
      new_points = Number(score.points);
      new_score_perc =
        current_submission.max_points > 0 ? (new_points * 100) / current_submission.max_points : 0;
      new_manual_points = new_points - (new_auto_points ?? current_submission.auto_points ?? 0);
    } else if (new_auto_points != null) {
      new_points = new_auto_points + (current_submission.manual_points ?? 0);
      new_score_perc =
        current_submission.max_points > 0 ? (new_points * 100) / current_submission.max_points : 0;
    }

    let grading_job_id = null;

    // if we were originally provided a submission_id or we have feedback or partial scores, create a
    // grading job and update the submission
    if (
      current_submission.submission_id &&
      ((submission_id != null && idsEqual(current_submission.submission_id, submission_id)) ||
        new_score_perc != null ||
        score?.feedback ||
        score?.partial_scores)
    ) {
      const grading_job_result = await sqldb.queryOneRowAsync(sql.insert_grading_job, {
        submission_id: current_submission.submission_id,
        authn_user_id,
        correct: new_auto_score_perc == null ? null : new_auto_score_perc > 50,
        score: new_score_perc == null ? null : new_score_perc / 100,
        auto_points: new_auto_points,
        manual_points: new_manual_points,
        feedback: score?.feedback,
        partial_scores: score?.partial_scores,
        manual_rubric_grading_id: manual_rubric_grading?.id,
      });
      grading_job_id = grading_job_result.rows[0].id;

      if (!current_submission.modified_at_conflict && current_submission.submission_id) {
        await sqldb.queryOneRowAsync(sql.update_submission_score, {
          submission_id: current_submission.submission_id,
          feedback: score?.feedback,
          partial_scores: score?.partial_scores,
          manual_rubric_grading_id: manual_rubric_grading?.id,
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

module.exports = {
  nextUngradedInstanceQuestionUrl,
  populateRubricData,
  populateManualGradingData,
  updateAssessmentQuestionRubric,
  updateInstanceQuestionScore,
};
