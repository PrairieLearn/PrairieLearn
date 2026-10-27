import { assert, describe, it } from 'vitest';

import { serializeGradingResultMessage } from './gradingResultMessage.js';

describe('serializeGradingResultMessage', () => {
  it('escapes SQS-forbidden characters in feedback and keys without changing the decoded results', () => {
    const results = {
      succeeded: true,
      results: {
        tests: [{ message: 'Feedback: \ufffe\uffff, café, 😀, \\uffff' }],
        'key\ufffe\uffff': 'value',
      },
    };

    const messageBody = serializeGradingResultMessage('123', results);

    assert.notMatch(messageBody, /[\ufffe\uffff]/u);
    assert.deepEqual(JSON.parse(messageBody), {
      jobId: '123',
      event: 'grading_result',
      data: results,
    });
  });

  it('omits multibyte results that exceed the inline byte budget', () => {
    const results = { message: 'é'.repeat(128 * 1024) };

    const messageBody = serializeGradingResultMessage('123', results);

    assert.deepEqual(JSON.parse(messageBody), { jobId: '123', event: 'grading_result' });
  });

  it('includes the envelope and Unicode escapes in the inline size limit', () => {
    const notification = {
      jobId: '123',
      event: 'grading_result',
      data: { message: '' },
    };
    const envelopeBytes = Buffer.byteLength(JSON.stringify(notification), 'utf8');
    notification.data.message =
      '\uffff' + 'a'.repeat(250 * 1024 - envelopeBytes - '\\uffff'.length);

    const messageBody = serializeGradingResultMessage(notification.jobId, notification.data);

    assert.deepEqual(JSON.parse(messageBody), notification);

    notification.data.message += 'a';
    assert.deepEqual(
      JSON.parse(serializeGradingResultMessage(notification.jobId, notification.data)),
      { jobId: '123', event: 'grading_result' },
    );
  });
});
