const { enqueueBatchedMigration } = require('@prairielearn/migrations');

module.exports = async function () {
  await enqueueBatchedMigration('20230407165410_test');
};
