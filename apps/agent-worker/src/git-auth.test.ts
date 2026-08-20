import { describe, expect, it } from 'vitest';

import { isGitReadRequest } from './git-auth.js';

const repository = 'https://github.com/prairielearn/course.git';

describe('Git read authorization', () => {
  it('allows upload-pack and rejects receive-pack even with a usable token', () => {
    expect(
      isGitReadRequest(new Request(`${repository}/info/refs?service=git-upload-pack`), repository),
    ).toBe(true);
    expect(
      isGitReadRequest(
        new Request(`${repository}/git-upload-pack`, { method: 'POST' }),
        repository,
      ),
    ).toBe(true);
    expect(
      isGitReadRequest(new Request(`${repository}/info/refs?service=git-receive-pack`), repository),
    ).toBe(false);
    expect(
      isGitReadRequest(
        new Request(`${repository}/git-receive-pack`, { method: 'POST' }),
        repository,
      ),
    ).toBe(false);
  });
});
