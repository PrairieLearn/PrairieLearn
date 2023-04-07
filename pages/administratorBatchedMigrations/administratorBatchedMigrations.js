// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');
const { selectAllBatchedMigrations } = require('@prairielearn/migrations');

const {
  AdministratorBatchedMigrations,
  AdministratorBatchedMigration,
} = require('./administratorBatchedMigrations.html');

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const batchedMigrations = await selectAllBatchedMigrations('prairielearn');
    res.send(AdministratorBatchedMigrations({ batchedMigrations, resLocals: res.locals }));
  })
);

router.get('/:batched_migration_id', async (req, res) => {
  res.send(AdministratorBatchedMigration({ resLocals: res.locals }));
});

module.exports = router;
