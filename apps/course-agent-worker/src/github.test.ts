import { describe, expect, it } from 'vitest';

import { githubReadUrl, proxyCourseGithubRead } from './github.js';

describe('course repository credential broker', () => {
  it('injects the PAT only for upload-pack on the configured repository', async () => {
    const fetchImplementation: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      return Response.json({ authorization: request.headers.get('authorization') });
    };
    const context = {
      containerId: 'sandbox-1',
      params: { containerId: 'sandbox-1', repository: 'PrairieLearn/course' },
    };
    const challenge = await proxyCourseGithubRead(
      new Request('https://github.com/PrairieLearn/course.git/info/refs?service=git-upload-pack'),
      { COURSE_AGENT_GITHUB_PAT: 'real-secret' },
      context,
      fetchImplementation,
    );
    expect(challenge.status).toBe(401);
    expect(challenge.headers.get('www-authenticate')).toBe('Basic realm="GitHub"');
    const response = await proxyCourseGithubRead(
      new Request('https://github.com/PrairieLearn/course.git/info/refs?service=git-upload-pack', {
        headers: { authorization: `Basic ${btoa('x-access-token:proxy-read')}` },
      }),
      { COURSE_AGENT_GITHUB_PAT: 'real-secret' },
      context,
      fetchImplementation,
    );
    expect(await response.json()).toEqual({
      authorization: `Basic ${btoa('x-access-token:real-secret')}`,
    });
    expect(
      (
        await proxyCourseGithubRead(
          new Request('https://github.com/PrairieLearn/course.git/git-receive-pack', {
            method: 'POST',
            headers: { authorization: `Basic ${btoa('x-access-token:proxy-read')}` },
          }),
          { COURSE_AGENT_GITHUB_PAT: 'real-secret' },
          context,
          fetchImplementation,
        )
      ).status,
    ).toBe(403);
  });

  it('normalizes supported GitHub repository URLs', () => {
    expect(githubReadUrl('git@github.com:PrairieLearn/course.git')).toBe(
      'https://x-access-token:proxy-read@github.com/PrairieLearn/course.git',
    );
    expect(() => githubReadUrl('https://example.com/course.git')).toThrow('github.com');
  });
});
