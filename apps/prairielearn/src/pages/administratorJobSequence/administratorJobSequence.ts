import express = require('express');
import asyncHandler = require('express-async-handler');

import * as serverJobs from '../../lib/server-jobs-legacy';
import { AdministratorJobSequence } from './administratorJobSequence.html';

const router = express.Router();

router.get(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    const job_sequence = await serverJobs.getJobSequenceWithFormattedOutputAsync(
      req.params.job_sequence_id,
      null,
    );

    res.send(
      AdministratorJobSequence({
        job_sequence,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
