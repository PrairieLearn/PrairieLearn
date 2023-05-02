// @ts-check
const { assert } = require('chai');
const { logger } = require('@prairielearn/logger');

const serverJobs = require('../lib/server-jobs');
const serverJobs2 = require('../lib/server-jobs-2');
const helperServer = require('./helperServer');

function disableLoggingForTests() {
  let originalSilent;
  before(() => {
    originalSilent = logger.silent;
    logger.silent = true;
  });
  after(() => {
    logger.silent = originalSilent;
  });
}

describe('server-jobs-2', () => {
  before(helperServer.before());
  after(helperServer.after);

  disableLoggingForTests();

  it('runs a sequence with a single job', async () => {
    const jobSequence = await serverJobs2.createJobSequence({
      type: 'test',
      description: 'test job sequence',
    });

    await jobSequence.execute(async ({ runJob }) => {
      await runJob(
        {
          type: 'test_job',
          description: 'test job',
        },
        async (job) => {
          job.info('testing stdout');
          job.error('testing stderr');
        }
      );
    });

    const finishedJobSequence = await serverJobs.getJobSequenceAsync(jobSequence.id, null);

    assert.equal(finishedJobSequence.type, 'test');
    assert.equal(finishedJobSequence.description, 'test job sequence');
    assert.equal(finishedJobSequence.status, 'Success');
    assert.lengthOf(finishedJobSequence.jobs, 1);

    const job = finishedJobSequence.jobs[0];
    assert.equal(job.type, 'test_job');
    assert.equal(job.description, 'test job');
    assert.equal(job.status, 'Success');
    assert.equal(job.stdout, 'testing stdout\n');
    assert.equal(job.stderr, 'testing stderr\n');
    assert.equal(job.output, 'testing stdout\ntesting stderr\n');
  });

  it('handles a job with an error', async () => {
    const jobSequence = await serverJobs2.createJobSequence({
      type: 'test',
      description: 'test job sequence',
    });

    await jobSequence.execute(async ({ runJob }) => {
      await runJob({}, async (job) => {
        job.info('testing stdout');
        job.error('testing stderr');
        throw new Error('failing job');
      });
    });

    const finishedJobSequence = await serverJobs.getJobSequenceAsync(jobSequence.id, null);

    assert.equal(finishedJobSequence.status, 'Error');
    assert.lengthOf(finishedJobSequence.jobs, 1);

    const job = finishedJobSequence.jobs[0];
    assert.equal(job.status, 'Error');
    assert.equal(job.stdout, 'testing stdout\n');
    assert.match(job.stderr, /^testing stderr\nError: failing job\n\s+at/);
  });
});
