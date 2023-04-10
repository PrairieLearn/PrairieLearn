const { enqueueBatchedMigration } = require('@prairielearn/migrations');

// TODO: delete this file before merging.
module.exports = async function () {
  await enqueueBatchedMigration('20230407165410_test');
};
