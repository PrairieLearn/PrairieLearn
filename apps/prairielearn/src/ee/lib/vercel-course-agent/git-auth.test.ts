import type { HarnessV1RequestTransformation } from '@ai-sdk/harness';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { NetworkPolicy, Sandbox } from '@vercel/sandbox';
import { expect, test, vi } from 'vitest';

import { withGitAuth } from './git-auth.js';

test('rehydrates read-only Git credentials alongside OpenAI rules on native session attachment', async () => {
  let policy: NetworkPolicy = 'allow-all';
  const update = vi.fn(async ({ networkPolicy }: { networkPolicy: NetworkPolicy }) => {
    policy = networkPolicy;
  });
  const sandbox = {
    name: 'test-sandbox',
    currentSession: () => ({ cwd: '/vercel/sandbox', networkPolicy: policy }),
    update,
  } as unknown as Sandbox;
  const provider = withGitAuth(
    createVercelSandbox({ sandbox }),
    'https://github.com/example/course.git',
    'read-only-test-pat',
  );
  const cloneSession = await provider.createSession();
  await cloneSession.addRequestTransformations!([]);
  const authorization = `Basic ${Buffer.from('x-access-token:read-only-test-pat').toString('base64')}`;
  const gitRules = [
    {
      match: {
        path: { exact: '/example/course.git/info/refs' },
        method: ['GET'],
        queryString: [{ key: { exact: 'service' }, value: { exact: 'git-upload-pack' } }],
      },
      transform: [{ headers: { Authorization: authorization } }],
    },
    {
      match: { path: { exact: '/example/course.git/git-upload-pack' }, method: ['POST'] },
      transform: [{ headers: { Authorization: authorization } }],
    },
  ];
  expect(policy).toEqual({ allow: { '*': [], 'github.com': gitRules } });

  const openAiRule: HarnessV1RequestTransformation = {
    match: { host: 'api.openai.com' },
    transform: { headers: { Authorization: 'Bearer test-openai-key' } },
  };
  const nativeSession = await provider.createSession();
  await nativeSession.addRequestTransformations!([openAiRule]);
  const combinedPolicy = {
    allow: {
      '*': [],
      'github.com': gitRules,
      'api.openai.com': [{ transform: [openAiRule.transform] }],
    },
  };
  expect(policy).toEqual(combinedPolicy);

  // Vercel returns redacted credentials when attaching a fresh session.
  policy = JSON.parse(
    JSON.stringify(policy)
      .replaceAll(authorization, '[REDACTED]')
      .replaceAll('Bearer test-openai-key', '[REDACTED]'),
  ) as NetworkPolicy;
  const resumed = await provider.resumeSession!({ sessionId: 'test-sandbox' });
  await resumed.addRequestTransformations!([openAiRule]);
  expect(policy).toEqual(combinedPolicy);
});
