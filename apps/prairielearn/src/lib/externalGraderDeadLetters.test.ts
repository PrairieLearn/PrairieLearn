import { assert, describe, expect, it, vi } from 'vitest';

import { processDeadLetterMessage } from './externalGraderDeadLetters.js';

describe('externalGraderDeadLetters', () => {
  it('marks jobs dead letter messages as failed', async () => {
    const markJobFailed = vi.fn().mockResolvedValue(undefined);
    const selectGradingJob = vi.fn().mockResolvedValue({ id: '1' });

    const shouldDelete = await processDeadLetterMessage(
      { jobId: '1' },
      {
        queueName: 'jobs-dead-letter-queue',
        queueType: 'jobs',
        markJobFailed,
        selectGradingJob,
      },
    );

    assert.isTrue(shouldDelete);
    expect(markJobFailed).toHaveBeenCalledExactlyOnceWith({
      gradingId: '1',
      grading: {
        receivedTime: null,
        startTime: null,
        endTime: null,
        score: 0,
        feedback: {
          succeeded: false,
          message:
            'Your submission could not be graded due to a system error. Please try submitting again.',
        },
        format_errors: {},
      },
    });
  });

  it('ignores non-terminal events in results dead letter queue', async () => {
    const markJobFailed = vi.fn().mockResolvedValue(undefined);
    const selectGradingJob = vi.fn().mockResolvedValue({ id: '1' });

    const shouldDelete = await processDeadLetterMessage(
      { jobId: '1', event: 'job_received' },
      {
        queueName: 'results-dead-letter-queue',
        queueType: 'results',
        markJobFailed,
        selectGradingJob,
      },
    );

    assert.isTrue(shouldDelete);
    expect(markJobFailed).not.toHaveBeenCalled();
  });

  it('marks grading_result messages in results dead letter queue as failed', async () => {
    const markJobFailed = vi.fn().mockResolvedValue(undefined);
    const selectGradingJob = vi.fn().mockResolvedValue({ id: '1' });

    const shouldDelete = await processDeadLetterMessage(
      { jobId: '1', event: 'grading_result' },
      {
        queueName: 'results-dead-letter-queue',
        queueType: 'results',
        markJobFailed,
        selectGradingJob,
      },
    );

    assert.isTrue(shouldDelete);
    expect(markJobFailed).toHaveBeenCalledOnce();
  });

  it('keeps message in queue when marking failed throws', async () => {
    const markJobFailed = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const selectGradingJob = vi.fn().mockResolvedValue({ id: '1' });

    const shouldDelete = await processDeadLetterMessage(
      { jobId: '1' },
      {
        queueName: 'jobs-dead-letter-queue',
        queueType: 'jobs',
        markJobFailed,
        selectGradingJob,
      },
    );

    assert.isFalse(shouldDelete);
    expect(markJobFailed).toHaveBeenCalledOnce();
  });

  it('deletes message with invalid jobId', async () => {
    const markJobFailed = vi.fn().mockResolvedValue(undefined);
    const selectGradingJob = vi.fn().mockResolvedValue(null);

    const shouldDelete = await processDeadLetterMessage(
      { jobId: undefined },
      {
        queueName: 'jobs-dead-letter-queue',
        queueType: 'jobs',
        markJobFailed,
        selectGradingJob,
      },
    );

    assert.isTrue(shouldDelete);
    expect(markJobFailed).not.toHaveBeenCalled();
    expect(selectGradingJob).not.toHaveBeenCalled();
  });

  it('deletes message when grading job has already been deleted', async () => {
    const markJobFailed = vi.fn().mockResolvedValue(undefined);
    const selectGradingJob = vi.fn().mockResolvedValue(null);

    const shouldDelete = await processDeadLetterMessage(
      { jobId: '1' },
      {
        queueName: 'jobs-dead-letter-queue',
        queueType: 'jobs',
        markJobFailed,
        selectGradingJob,
      },
    );

    assert.isTrue(shouldDelete);
    expect(selectGradingJob).toHaveBeenCalledExactlyOnceWith('1');
    expect(markJobFailed).not.toHaveBeenCalled();
  });
});
