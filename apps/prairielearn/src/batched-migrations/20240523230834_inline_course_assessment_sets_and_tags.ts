import { makeBatchedMigration } from '@prairielearn/migrations';
import { queryOneRowAsync, queryRows } from '@prairielearn/postgres';

import { CourseSchema } from '../lib/db-types.js';

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from pl_courses;', {});
    return {
      min: 1n,
      max: result.rows[0].max,
      batchSize: 10,
    };
  },

  async execute(min: bigint, max: bigint) {
    const courses = await queryRows(
      'SELECT * FROM pl_courses WHERE id >= $min AND id <= $max AND deleted_at IS NULL',
      { min, max },
      CourseSchema,
    );

    for (const course of courses) {
      await inlineAssessmentSetsAndTagsForCourse(course);
    }
  },
});

async function inlineAssessmentSetsAndTagsForCourse(course: Course) {
  // TODO: implement this!
}
