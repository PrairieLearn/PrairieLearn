import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseUrl = process.env.AGENT_WORKER_URL ?? 'http://localhost:8787';

const healthResponse = await fetch(`${baseUrl}/health`);
assert.equal(healthResponse.status, 200);
assert.deepEqual(await healthResponse.json(), { status: 'ok' });

const conversationId = `local-smoke-${randomUUID()}`;
const attempts = await Promise.all([requestSmoke(conversationId), requestSmoke(conversationId)]);
assert.deepEqual(attempts.map(({ response }) => response.status).sort(), [200, 409]);

const { response: smokeResponse, result: smokeResult } = attempts.find(
  ({ response }) => response.status === 200,
);
assert.equal(smokeResponse.status, 200, JSON.stringify(smokeResult));
assert.equal(smokeResult.status, 'ok');
assert.equal(smokeResult.conversation_id, conversationId);
assert.equal(smokeResult.sandbox.exit_code, 0);
assert.match(smokeResult.sandbox.stdout, /claude-agent-sdk-ok/);
assert.match(smokeResult.sandbox.stdout, /sandbox-ok/);
assert.match(
  smokeResult.checkpoint_key,
  new RegExp(`^conversations/${conversationId}/runs/.+/local-smoke\\.json$`),
);

process.stdout.write(`${JSON.stringify(smokeResult, null, 2)}\n`);

async function requestSmoke(conversationId) {
  const response = await fetch(`${baseUrl}/internal/local/smoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId }),
  });

  return { response, result: await response.json() };
}
