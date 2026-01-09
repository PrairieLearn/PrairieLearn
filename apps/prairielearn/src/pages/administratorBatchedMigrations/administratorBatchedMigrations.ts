import { Router } from 'express';

import * as error from '@prairielearn/error';
import {
  retryFailedBatchedMigrationJobs,
  selectAllBatchedMigrations,
  selectBatchedMigration,
  selectRecentJobsWithStatus,
} from '@prairielearn/migrations';

import { typedAsyncHandler } from '../../lib/res-locals.js';

import {
  AdministratorBatchedMigration,
  AdministratorBatchedMigrations,
} from './administratorBatchedMigrations.html.js';

const router = Router({ mergeParams: true });

const PROJECT = 'prairielearn';

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const batchedMigrations = await selectAllBatchedMigrations(PROJECT);
    res.send(AdministratorBatchedMigrations({ batchedMigrations, resLocals: res.locals }));
  }),
);

router.get(
  '/:batched_migration_id',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const batchedMigration = await selectBatchedMigration(PROJECT, req.params.batched_migration_id);
    const recentSucceededJobs = await selectRecentJobsWithStatus(
      batchedMigration.id,
      'succeeded',
      10,
    );
    const recentFailedJobs = await selectRecentJobsWithStatus(batchedMigration.id, 'failed', 10);
    res.send(
      AdministratorBatchedMigration({
        batchedMigration,
        recentSucceededJobs,
        recentFailedJobs,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/:batched_migration_id',
  typedAsyncHandler<'plain'>(async (req, res) => {
    if (req.body.__action === 'retry_failed_jobs') {
      await retryFailedBatchedMigrationJobs(PROJECT, req.params.batched_migration_id);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
