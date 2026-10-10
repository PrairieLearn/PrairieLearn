import { expect, it } from 'vitest';

import { serviceHeaders, verifyServiceRequest } from '@prairielearn/course-agent-contract';

const scope = { conversationId: crypto.randomUUID(), courseId: '1', userId: '2', authnUserId: '2' };
const secret = 'service-signing-contract-fixture-not-a-secret';
it('binds the signature to audience, verb, path/query, actor, body, and its acceptance window', async () => {
  const path = `/v1/conversations/${scope.conversationId}/messages?cursor=1`;
  const body = JSON.stringify({ text: 'Preserve this input.' });
  const now = Date.now();
  const headers = await serviceHeaders(secret, 'agent-api', 'POST', path, scope, { body, now });
  const request = new Request(`https://agent.example${path}`, { method: 'POST', headers });
  expect(await verifyServiceRequest(request, secret, 'agent-api', body, now)).toEqual(scope);
  expect(await verifyServiceRequest(request, secret, 'pl-api', body, now)).toBeNull();
  expect(await verifyServiceRequest(request, secret, 'agent-api', body + ' ', now)).toBeNull();
  expect(await verifyServiceRequest(request, secret, 'agent-api', body, now + 60001)).toBeNull();
  expect(
    await verifyServiceRequest(
      new Request(request.url, { method: 'GET', headers }),
      secret,
      'agent-api',
      body,
      now,
    ),
  ).toBeNull();
  expect(
    await verifyServiceRequest(
      new Request(request.url + '0', { method: 'POST', headers }),
      secret,
      'agent-api',
      body,
      now,
    ),
  ).toBeNull();
  const altered = { ...headers, 'X-Course-Agent-Scope': JSON.stringify({ ...scope, userId: '3' }) };
  expect(
    await verifyServiceRequest(
      new Request(request.url, { method: 'POST', headers: altered }),
      secret,
      'agent-api',
      body,
      now,
    ),
  ).toBeNull();
});
