import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

const origin = process.env.COURSE_AGENT_URL ?? 'http://localhost:8791';
const token = process.env.COURSE_AGENT_SERVICE_TOKEN ?? 'local-fixture-service-token-not-a-secret';
const conversation = randomUUID();
const base = new URL(`/agents/chat/${conversation}/`, origin);
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function request(path, body) {
  const response = await fetch(new URL(path, base), {
    method: body ? 'POST' : 'GET',
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`${path} failed (${response.status})`);
  return response;
}
await request('configure', {
  repository: process.env.COURSE_AGENT_REPOSITORY ?? 'example/course',
  branch: process.env.COURSE_AGENT_BRANCH ?? 'main',
});
await request('message', {
  id: randomUUID(),
  dispatchId: randomUUID(),
  expectedRevision: 0,
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
