import express = require('express');
import asyncHandler = require('express-async-handler');

import serverJobs = require('../../lib/server-jobs-legacy');
import { administratorJobSequence } from './administratorJobSequence.html';

const router = express.Router();

router.get(
  '/:job_sequence_id',
  asyncHandler(async (req, res) => {
    const job_sequence_id = req.params.job_sequence_id;
    const job_sequence = await serverJobs.getJobSequenceWithFormattedOutputAsync(
      job_sequence_id,
      null,
    );

    res.locals.job_sequence = job_sequence;
    res.send(
      administratorJobSequence({
        job_sequence,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
