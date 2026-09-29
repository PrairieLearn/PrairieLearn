import { expect, it } from 'vitest';

import { forwardGitHub, forwardOpenAI } from '../src/outbound.js';

it('binds Git credentials to the configured repository and strips sandbox headers', async () => {
  let captured: Request | undefined;
  const send: typeof fetch = async (request) => {
    captured = request as Request;
    return new Response('ok');
  };
  const response = await forwardGitHub(
    new Request('http://github.com/org/course.git/info/refs?service=git-upload-pack', {
      headers: { Authorization: 'attacker', 'X-Secret': 'private' },
    }),
    { repository: 'org/course', GITHUB_TOKEN: 'scoped-token' },
    send,
  );
  expect(response.status).toBe(200);
  expect(captured?.url).toBe('https://github.com/org/course.git/info/refs?service=git-upload-pack');
  expect(captured?.headers.get('X-Secret')).toBeNull();
  expect(captured?.headers.get('Authorization')).not.toBe('attacker');
});
it.each([
  'http://github.com/other/course.git/info/refs?service=git-upload-pack',
  'http://github.com/org/course.git/info/refs?service=git-receive-pack',
  'https://api.github.com/repos/org/course',
])('rejects unapproved outbound access %s', async (url) => {
  let called = false;
  const response = await forwardGitHub(
    new Request(url),
    { repository: 'org/course', GITHUB_TOKEN: 'scoped-token' },
    async () => {
      called = true;
      return new Response();
    },
  );
  expect(response.status).toBe(403);
  expect(called).toBe(false);
});
it('does not follow a credential-bearing redirect', async () => {
  const response = await forwardGitHub(
    new Request('http://github.com/org/course.git/info/refs?service=git-upload-pack'),
    { repository: 'org/course', GITHUB_TOKEN: 'scoped-token' },
    async () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } }),
  );
  expect(response.status).toBe(502);
});
it('limits model credential injection to the inference endpoints', async () => {
  const response = await forwardOpenAI(
    new Request('http://openai.internal/v1/files', { method: 'POST' }),
    { CODEX_API_KEY: 'secret' },
  );
  expect(response.status).toBe(403);
});
