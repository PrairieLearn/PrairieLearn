import { assert, describe, it } from 'vitest';

import { agentBranch, checkpointBindingMatches } from './git-checkpoints.js';

describe('agentBranch', () => {
  it('produces a stable safe ref', () => {
    assert.equal(agentBranch('course/1', 'run 1'), 'pl-agent/course-1/run-1');
  });

  it('binds restored bundles to the authorized course and repository', () => {
    const repository = {
      https_url: 'https://github.com/prairielearn/course.git',
      branch: 'main',
      base_sha: '1'.repeat(40),
    };
    const manifest = {
      version: 1 as const,
      conversationId: 'conversation-1',
      courseId: 'course-1',
      repository,
      branch: 'pl-agent/course-1/run-1',
      headSha: '2'.repeat(40),
      parts: [],
      updatedAt: new Date(0).toISOString(),
    };

    assert.equal(checkpointBindingMatches(manifest, 'course-1', repository), true);
    assert.equal(checkpointBindingMatches(manifest, 'course-2', repository), false);
    assert.equal(checkpointBindingMatches(manifest, 'course-1', undefined), false);
  });
});
