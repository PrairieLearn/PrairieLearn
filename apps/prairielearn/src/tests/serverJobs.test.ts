import stripAnsi from 'strip-ansi';
import { afterAll, assert, beforeAll, describe, expect, it, vi } from 'vitest';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { createServerJob, getJobSequence } from '../lib/server-jobs.js';

import * as helperServer from './helperServer.js';

function disableLoggingForTests() {
  let originalSilent: boolean;
  beforeAll(() => {
    originalSilent = logger.silent;
    logger.silent = true;
  });
  afterAll(() => {
    logger.silent = originalSilent;
  });
}

describe('server-jobs', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  disableLoggingForTests();

  describe('execute', () => {
    it('runs a job', async () => {
      const serverJob = await createServerJob({
        type: 'test',
        description: 'test server job',
        userId: null,
        authnUserId: null,
      });

      await serverJob.execute(async (job) => {
        job.info('testing info');
        job.error('testing error');
        job.data.foo = 'bar';
      });

      const finishedJobSequence = await getJobSequence(serverJob.jobSequenceId, null);

      assert.equal(finishedJobSequence.type, 'test');
      assert.equal(finishedJobSequence.description, 'test server job');
      assert.equal(finishedJobSequence.status, 'Success');
      assert.lengthOf(finishedJobSequence.jobs, 1);

      const job = finishedJobSequence.jobs[0];
      assert.equal(job.type, 'test');
      assert.equal(job.description, 'test server job');
      assert.equal(job.status, 'Success');
      assert.equal(stripAnsi(job.output ?? ''), 'testing info\ntesting error\n');
      assert.deepEqual(job.data.foo, 'bar');
    });

    it('runs a job with an error', async () => {
      const serverJob = await createServerJob({
        type: 'test',
        description: 'test job sequence',
        userId: null,
        authnUserId: null,
      });

      await expect(
        serverJob.execute(async (job) => {
          job.info('testing info');
          throw new Error('failing job');
        }),
      ).resolves.not.toThrow();

      const finishedJobSequence = await getJobSequence(serverJob.jobSequenceId, null);

      assert.equal(finishedJobSequence.status, 'Error');
      assert.lengthOf(finishedJobSequence.jobs, 1);

      const job = finishedJobSequence.jobs[0];
      assert.equal(job.status, 'Error');
      assert.match(stripAnsi(job.output ?? ''), /^testing info\nError: failing job\n\s+at/);
    });

    it('fails the job when fail() is called', async () => {
      const serverJob = await createServerJob({
        type: 'test',
        description: 'test job sequence',
        userId: null,
        authnUserId: null,
      });

      await expect(
        serverJob.execute(async (job) => {
          job.fail('failing job');
        }),
      ).resolves.not.toThrow();

      const finishedJobSequence = await getJobSequence(serverJob.jobSequenceId, null);

      assert.equal(finishedJobSequence.status, 'Error');
      assert.lengthOf(finishedJobSequence.jobs, 1);

      // The difference between this test and the previous one is that we assert
      // that the output is exactly equal to the string passed to `fail()`. We
      // don't expect there to be a stack trace.
      const job = finishedJobSequence.jobs[0];
      assert.equal(job.status, 'Error');
      assert.equal(stripAnsi(job.output || ''), 'failing job\n');
    });
  });

  describe('executeUnsafe', () => {
    it('propagates error to the caller', async () => {
      const serverJob = await createServerJob({
        type: 'test',
        description: 'test job sequence',
        userId: null,
        authnUserId: null,
      });

      await expect(
        serverJob.executeUnsafe(async (job) => {
          job.info('testing info');
          throw new Error('failing job');
        }),
      ).rejects.toThrow();

      await helperServer.waitForJobSequence(serverJob.jobSequenceId);

      const finishedJobSequence = await getJobSequence(serverJob.jobSequenceId, null);

      assert.equal(finishedJobSequence.status, 'Error');
      assert.lengthOf(finishedJobSequence.jobs, 1);

      const job = finishedJobSequence.jobs[0];
      assert.equal(job.status, 'Error');
      assert.match(stripAnsi(job.output ?? ''), /^testing info\nError: failing job\n\s+at/);
    });
  });

  describe('Sentry error reporting', () => {
    it('does not report errors to Sentry by default', async () => {
      const sentrySpy = vi.spyOn(Sentry, 'captureException');

      const serverJob = await createServerJob({
        type: 'test',
        description: 'test job sequence',
        userId: null,
        authnUserId: null,
      });

      await serverJob.execute(async () => {
        throw new Error('test error');
      });

      expect(sentrySpy).not.toHaveBeenCalled();
      sentrySpy.mockRestore();
    });

    it('reports unexpected errors to Sentry when enabled', async () => {
      const sentrySpy = vi.spyOn(Sentry, 'captureException');

      const serverJob = await createServerJob({
        type: 'test_type',
        description: 'test description',
        userId: null,
        authnUserId: null,
        reportErrorsToSentry: true,
      });

      await serverJob.execute(async () => {
        throw new Error('unexpected error');
      });

      expect(sentrySpy).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({
            'job_sequence.id': serverJob.jobSequenceId,
            'job_sequence.type': 'test_type',
          }),
          extra: expect.objectContaining({
            description: 'test description',
          }),
        }),
      );
      sentrySpy.mockRestore();
    });

    it('does not report job.fail() errors to Sentry even when enabled', async () => {
      const sentrySpy = vi.spyOn(Sentry, 'captureException');

      const serverJob = await createServerJob({
        type: 'test',
        description: 'test job sequence',
        userId: null,
        authnUserId: null,
        reportErrorsToSentry: true,
      });

      await serverJob.execute(async (job) => {
        job.fail('intentional failure');
      });

      expect(sentrySpy).not.toHaveBeenCalled();
      sentrySpy.mockRestore();
    });
  });
});
