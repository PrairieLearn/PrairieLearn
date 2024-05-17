import express from 'express';
import asyncHandler from 'express-async-handler';

import { getJobSequenceWithFormattedOutput } from '../../lib/server-jobs.js';

import { AdministratorJobSequence } from './administratorJobSequence.html.js';

const router = express.Router();

router.get(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    const job_sequence = await getJobSequenceWithFormattedOutput(req.params.job_sequence_id, null);

    res.send(
      AdministratorJobSequence({
        job_sequence,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
