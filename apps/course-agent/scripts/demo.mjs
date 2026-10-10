import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { serviceHeaders } from '@prairielearn/course-agent-contract';

const origin = process.env.COURSE_AGENT_URL ?? 'http://localhost:8791';
const token = process.env.COURSE_AGENT_SERVICE_TOKEN ?? 'local-fixture-service-token-not-a-secret';
const conversation = process.env.COURSE_AGENT_CONVERSATION_ID ?? randomUUID();
const base = new URL(`/v1/conversations/${conversation}`, origin);
const scope = {
  conversationId: conversation,
  courseId: process.env.COURSE_AGENT_COURSE_ID ?? '1',
  userId: process.env.COURSE_AGENT_USER_ID ?? '1',
  authnUserId: process.env.COURSE_AGENT_AUTHN_USER_ID ?? process.env.COURSE_AGENT_USER_ID ?? '1',
};

async function request(path, body, method = body ? 'POST' : 'GET') {
  const url = new URL(base.pathname + (path ? '/' + path : ''), base);
  const json = body === undefined ? '' : JSON.stringify(body);
  const response = await fetch(url, {
    method,
    headers: await serviceHeaders(token, 'agent-api', method, url.pathname, scope, { body: json }),
    body: json || undefined,
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`${path} failed (${response.status})`);
  return response;
}
await request(
  '',
  {
    repository: process.env.COURSE_AGENT_REPOSITORY ?? 'example/course',
    branch: process.env.COURSE_AGENT_BRANCH ?? 'main',
  },
  'PUT',
);
await request('messages', {
  id: randomUUID(),
  expectedRevision: (await (await request('snapshot')).json()).revision,
  text:
    process.argv
      .slice(2)
      .filter((argument) => argument !== '--')
      .join(' ') || 'Please inspect the course.',
});
process.stdout.write(`Conversation: ${conversation}\n`);
for (let attempt = 0; attempt < 120; attempt++) {
  const snapshot = await (await request('snapshot')).json();
  if (!Object.values(snapshot.executions ?? {}).some((receipt) => receipt.status === 'running')) {
    process.stdout.write(`${JSON.stringify(snapshot.messages, null, 2)}\n`);
    break;
  }
  await setTimeout(1000);
  if (attempt === 119) {
    throw new Error('Conversation still running; reconnect using the printed ID.');
  }
}
