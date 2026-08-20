import { describe, expect, it } from 'vitest';

import { type PublicationRecord, isCurrentRun, publicationReservation } from './run-guards.js';

const request = {
  operation_id: 'operation-1',
  target: {
    https_url: 'https://github.com/prairielearn/course.git',
    branch: 'pl-agent/course/run-1',
    head_sha: '1'.repeat(40),
  },
};
const response = {
  operation_id: request.operation_id,
  branch: request.target.branch,
  head_sha: request.target.head_sha,
};

describe('run guards', () => {
  it('does not expose a newer current run through an older run URL', () => {
    expect(isCurrentRun('run-2', 'run-1')).toBe(false);
    expect(isCurrentRun('run-2', 'run-2')).toBe(true);
  });

  it('replays an identical completed publication receipt', () => {
    const existing: PublicationRecord = { request, status: 'completed', response };
    expect(publicationReservation(existing, request)).toEqual({ kind: 'replay', response });
  });

  it('rejects pending publication replay and operation ID target reuse', () => {
    expect(() => publicationReservation({ request, status: 'pending' }, request)).toThrow(
      'already in progress',
    );
    expect(() =>
      publicationReservation(
        { request, status: 'completed', response },
        { ...request, target: { ...request.target, branch: 'another-branch' } },
      ),
    ).toThrow('already used');
  });
});
