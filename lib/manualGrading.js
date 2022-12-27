const async = require('async');
const mustache = require('mustache');

const markdown = require('./markdown');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
  /** Builds the URL of an instance question tagged to be manually graded for a particular
   * assessment question. Only returns instance questions assigned to a particular grader.
   *
   * @params {string} urlPrefix - URL prefix for the current course instance.
   * @param {number} assessment_id - The assessment linked to the assessment question. Used to ensure the assessment is authorized, since middlewares don't authenticate assessment questions.
   * @param {number} assessment_question_id - The assessment question being graded.
   * @param {number} user_id - The user_id of the current grader. Typically the current effective user.
   * @param {number} prior_instance_question_id - The instance question previously graded. Used to ensure a consistent order if a grader starts grading from the middle of a list or skips an instance.
   */
  nextUngradedInstanceQuestionUrl: async (
    urlPrefix,
    assessment_id,
    assessment_question_id,
    user_id,
    prior_instance_question_id
  ) => {
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
  },

  /** Builds the locals object for rubric data. Will typically be called twice for an instance
   * question: once for manual grading, and once for auto grading. Returns an object that is to be
   * assigned to `XXX_rubric_data` in locals.
   *
   * @param {number} assessment_question_id - The assessment question associated to the rubric. Used to obtain the number of submissions associated to each rubric item.
   * @param {number} rubric_id - The rubric being selected. Will typically be either manual_rubric_id or auto_rubric_id in the assessment question.
   * @param {number} rubric_grading_id - The rubric grading being selected. Will typically be either manual_rubric_grading_id or auto_rubric_grading_id in the instance question.
   * @param {Object} mustache_data - The data to be used to render mustache tags.
   */
  selectRubricGradingData: async (
    assessment_question_id,
    rubric_id,
    rubric_grading_id,
    mustache_data
  ) => {
    if (!rubric_id) {
      return null;
    }
    const params = {
      assessment_question_id,
      rubric_id,
      rubric_grading_id,
    };
    const rubric_data = (await sqldb.queryZeroOrOneRowAsync(sql.select_rubric_data, params))
      .rows[0];

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
  },

  /**
   */
  updateAssessmentQuestionRubric: async (
    assessment_question_id,
    rubric_type,
    use_rubrics,
    starting_points,
    min_points,
    max_points,
    rubric_items,
    tag_for_manual_grading,
    authn_user_id
  ) => {
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
          auto_rubric_id:
            rubric_type === 'auto' ? new_rubric_id : assessment_question.auto_rubric_id,
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

        // Recompute grades for existing instance questions using this rubric
        await sqldb.queryWithClientAsync(client, sql.recompute_instance_questions, {
          assessment_question_id,
          rubric_type,
          authn_user_id,
        });
      }

      if (tag_for_manual_grading) {
        await sqldb.queryWithClientAsync(client, sql.tag_for_manual_grading, {
          assessment_question_id,
        });
      }
    });
  },
};
