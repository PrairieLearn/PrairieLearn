const { finalizeBatchedMigration } = require('@prairielearn/migrations');

module.exports = async function () {
  await finalizeBatchedMigration('20230418190511_variants_course_id');
}
