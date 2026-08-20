import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { SignJWT } from 'jose';

const baseUrl = process.env.AGENT_WORKER_URL ?? 'http://localhost:8787';
const secret = process.env.AGENT_CAPABILITY_SECRET ?? 'local-agent-capability-secret-32-bytes';
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const phase = args[0] ?? 'all';
const statePath = args[1] ?? '/tmp/prairielearn-agent-smoke.json';

assert.deepEqual(await json(await fetch(`${baseUrl}/health`)), { status: 'ok', enabled: true });

if (phase === 'start' || phase === 'all') await startPhase();
if (phase === 'resume' || phase === 'all') await resumePhase();

async function startPhase() {
  const state = {
    conversation_id: `local-smoke-${randomUUID()}`,
    course_id: 'deterministic-course',
    run_id: `run-${randomUUID()}`,
    prompt: 'Create and render one deterministic question',
  };
  const competing = {
    ...state,
    run_id: `run-${randomUUID()}`,
    prompt: 'This concurrent turn must be rejected',
  };
  const [first, second] = await Promise.all([startRun(state), startRun(competing)]);
  assert.deepEqual([first.status, second.status].sort(), [202, 409]);
  const accepted = first.status === 202 ? state : competing;
  const completed = await poll(accepted, 'completed');
  assert.ok(completed.checkpoint_key);
  await writeFile(statePath, `${JSON.stringify(accepted, null, 2)}\n`);
  process.stdout.write(
    `phase=start completed run ${accepted.run_id}; restart Wrangler with the same persisted state\n`,
  );
}

async function resumePhase() {
  const first = JSON.parse(await readFile(statePath, 'utf8'));
  const firstControl = await token(first, 'control');
  const checkpoint = await json(
    await authorized(`/internal/local/runs/${first.run_id}/checkpoint`, firstControl),
  );
  const destroy = await authorized(
    `/internal/local/conversations/${first.conversation_id}/destroy-sandbox`,
    firstControl,
    { method: 'POST' },
  );
  assert.equal(destroy.status, 204);

  const publication = {
    operation_id: `publish-${randomUUID()}`,
    target: {
      https_url: 'https://local.invalid/course.git',
      branch: `pl-agent/${first.course_id}/${first.run_id}`,
      head_sha: checkpoint.head_sha,
    },
  };
  const publishToken = await token(first, 'publish', publication);
  for (let attempt = 0; attempt < 2; attempt++) {
    const published = await authorized(`/v1/runs/${first.run_id}/publish`, publishToken, {
      method: 'POST',
      body: JSON.stringify(publication),
    });
    assert.equal(published.status, 200, await published.text());
  }

  const resumed = {
    ...first,
    run_id: `run-${randomUUID()}`,
    prompt: 'Resume after Worker restart and sandbox destruction',
  };
  assert.equal((await startRun(resumed)).status, 202);
  await poll(resumed, 'completed');

  const cancelled = {
    ...first,
    run_id: `run-${randomUUID()}`,
    prompt: '[wait-for-cancel] cancel this deterministic turn',
  };
  assert.equal((await startRun(cancelled)).status, 202);
  const cancelToken = await token(cancelled, 'control');
  const cancel = await authorized(`/v1/runs/${cancelled.run_id}/cancel`, cancelToken, {
    method: 'POST',
  });
  assert.equal(cancel.status, 200, await cancel.text());
  await poll(cancelled, 'cancelled');

  const deleteToken = await token(cancelled, 'delete');
  const deleted = await authorized(`/v1/conversations/${first.conversation_id}`, deleteToken, {
    method: 'DELETE',
  });
  assert.equal(deleted.status, 204, await deleted.text());
  const count = await json(
    await authorized(
      `/internal/local/conversations/${first.conversation_id}/object-count`,
      deleteToken,
    ),
  );
  assert.equal(count.count, 0);
  process.stdout.write(
    `phase=resume recovered, published, cancelled, and deleted ${first.conversation_id}\n`,
  );
}

async function startRun(run) {
  return await authorized('/v1/runs/start', await token(run, 'run'), {
    method: 'POST',
    body: JSON.stringify({
      ...run,
      prairielearn_base_url: 'http://prairielearn-fixture.invalid',
      harness: 'deterministic',
    }),
  });
}

async function poll(run, expected) {
  const control = await token(run, 'control');
  for (let attempt = 0; attempt < 180; attempt++) {
    const response = await authorized(`/v1/runs/${run.run_id}`, control);
    if (response.status === 200) {
      const status = await json(response);
      if (status.status === expected) return status;
      if (status.status === 'failed') throw new Error(JSON.stringify(status));
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${run.run_id} to become ${expected}`);
}

async function token(run, purpose, publication) {
  const now = Math.floor(Date.now() / 1_000);
  const claims = {
    sub: 'local-user',
    jti: randomUUID(),
    run_id: run.run_id,
    conversation_id: run.conversation_id,
    course_id: run.course_id,
    authn_user_id: 'local-user',
    user_id: 'local-user',
    allowed_tools: [
      'list_entities',
      'read_course_file',
      'query_course_data',
      'render_question',
      'get_job_output',
    ],
    purpose,
    prompt_sha256: createHash('sha256').update(run.prompt).digest('hex'),
    prairielearn_base_url: 'http://prairielearn-fixture.invalid',
    harness: 'deterministic',
    ...publication,
  };
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('prairielearn')
    .setAudience(['prairielearn-agent-worker', 'prairielearn-agent-api'])
    .setIssuedAt(now)
    .setExpirationTime(now + 3_600)
    .sign(new TextEncoder().encode(secret));
}

async function authorized(path, bearer, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${bearer}`);
  if (init.body) headers.set('content-type', 'application/json');
  return await fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function json(response) {
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return await response.json();
}
