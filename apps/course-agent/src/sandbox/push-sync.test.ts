import { expect, it } from 'vitest';

import type { ReviewOutcome } from '@prairielearn/course-agent-types';

import { nativeRunner } from '../../tests/native-fixture.js';

import { CodexAppServerClient } from './codex.js';
import type { CourseSandbox } from './sandbox.js';

it('already-incorporated review does not start another native turn', async () => {
  const outcome: ReviewOutcome = {
    callId: 'review-1',
    result: {
      decision: 'denied',
      publication: { status: 'not_attempted' },
      sync: { status: 'not_attempted' },
    },
  };
  const runner = nativeRunner(outcome);
  const native = new CodexAppServerClient({
    fetch: runner.fetch,
  } as unknown as DurableObjectStub<CourseSandbox>);
  native.beginTurn('assistant');
  await native.connect();
  await native.thread({ model: 'test', instructions: 'Edit course', threadId: 'native-thread' });
  await native.run(outcome, () => {});
  expect(runner.submissions).toEqual([]);
  native.closeStream();
  runner.close();
});
