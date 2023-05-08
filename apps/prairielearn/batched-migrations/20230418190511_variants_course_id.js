const { makeBatchedMigration } = require('@prairielearn/migrations');
const { queryOneRowAsync, queryAsync } = require('@prairielearn/postgres');

module.exports = makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from variants;', {});
    return {
      min: 1,
      max: result.rows[0].max,
      batchSize: 1000,
    };
  },

  async execute(min, max) {
    await queryAsync(
      `
      UPDATE variants AS v
      SET
        course_id = q.course_id
      FROM
        questions AS q
      WHERE
        v.course_id IS NULL AND
        v.question_id = q.id AND
        v.id >= $min AND
        v.id <= $max`,
      { min, max }
    );
  },
});
