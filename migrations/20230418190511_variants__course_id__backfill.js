const { enqueueBatchedMigration } = require('@prairielearn/migrations');

module.exports = async function () {
  await enqueueBatchedMigration('20230418190511_variants_course_id');
};
