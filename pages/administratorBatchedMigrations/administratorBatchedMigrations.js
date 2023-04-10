// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');
const { selectAllBatchedMigrations, selectBatchedMigration } = require('@prairielearn/migrations');

const {
  AdministratorBatchedMigrations,
  AdministratorBatchedMigration,
} = require('./administratorBatchedMigrations.html');

const router = Router({ mergeParams: true });

const PROJECT = 'prairielearn';

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const batchedMigrations = await selectAllBatchedMigrations(PROJECT);
    res.send(AdministratorBatchedMigrations({ batchedMigrations, resLocals: res.locals }));
  })
);

router.get(
  '/:batched_migration_id',
  asyncHandler(async (req, res) => {
    console.log(req.params);
    const batchedMigration = await selectBatchedMigration(PROJECT, req.params.batched_migration_id);
    res.send(AdministratorBatchedMigration({ batchedMigration, resLocals: res.locals }));
  })
);

module.exports = router;
