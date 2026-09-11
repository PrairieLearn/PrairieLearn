import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCodex } from './run-codex.mjs';

// Run in the pinned sandbox image with --network none and a writable /tmp.
const cwd = await mkdtemp(join(tmpdir(), 'course-agent-continuation-'));
const codexHome = join(cwd, '.codex');
process.env.OPENAI_API_KEY = 'local-mock-key';
const requests = [];
const denied = process.argv.includes('--deny');
const renderAfterPublication = process.argv.includes('--render');
const lostWorkspace = process.argv.includes('--lost-workspace');
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (!req.url.endsWith('/responses')) {
    res.writeHead(404).end();
    return;
  }
  const request = JSON.parse(body);
  requests.push(request);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const event = (type, data) =>
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  const responseId = `resp_${requests.length}`;
  const item =
    requests.length === 1
      ? {
          type: 'function_call',
          id: 'fc_publish',
          call_id: 'call_publish',
          name: 'push_sync',
          arguments: '{}',
        }
      : renderAfterPublication && requests.length === 2
        ? {
            type: 'function_call',
            id: 'fc_render',
            call_id: 'call_render',
            name: 'render_question_variant',
            arguments: JSON.stringify({ qid: 'example', seed: '123' }),
          }
        : {
            type: 'message',
            role: 'assistant',
            id: 'msg_done',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Publication finished.', annotations: [] }],
          };
  event('response.created', { response: { id: responseId, status: 'in_progress', output: [] } });
  event('response.output_item.added', { output_index: 0, item });
  event('response.output_item.done', { output_index: 0, item });
  event('response.completed', {
    response: {
      id: responseId,
      status: 'completed',
      output: [item],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    },
  });
  res.end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

try {
  const events = [];
  const options = {
    cwd,
    codexHome,
    model: 'mock-model',
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    emit: (event) => events.push(event),
    watchActivity: () => () => {},
    renderQuestion: async (input) => {
      assert.deepEqual(input, { qid: 'example', seed: '123' });
      return {
        success: true,
        qid: input.qid,
        seed: input.seed,
        syncedRevision: 'a'.repeat(40),
        diagnostics: [],
      };
    },
  };
  await runCodex({
    ...options,
    prompt: 'Publish my changes.',
    requestApproval: async () => 'approval-test',
  });
  assert.equal(events.at(-1).method, 'course_agent/approvalPaused');
  assert.equal(requests.length, 1);
  const continuation = { approvalId: 'approval-test', ok: !denied, denied, synced: !denied };
  await runCodex({
    ...options,
    ...(lostWorkspace
      ? {
          codexHome: join(cwd, '.recovered'),
          history: [{ role: 'user', content: 'Publish my changes.' }],
        }
      : {}),
    prompt: '',
    continuation,
  });
  assert.equal(events.at(-1).method, 'turn/completed');
  assert.equal(
    requests.length,
    renderAfterPublication ? 3 : 2,
    'Restart must not replay publication or run a hidden turn',
  );
  const inputs = requests[1].input;
  if (lostWorkspace) {
    assert.ok(
      inputs.some(
        (i) =>
          i.role === 'user' && JSON.stringify(i).includes('authoritative saved push_sync outcome'),
      ),
    );
    assert.ok(!inputs.some((i) => i.type === 'function_call_output'));
  } else {
    assert.ok(
      inputs.some(
        (i) =>
          i.type === 'function_call_output' && JSON.stringify(i.output).includes('approval-test'),
      ),
    );
    assert.equal(
      inputs.filter((i) => i.role === 'user' && JSON.stringify(i).includes('approval-test')).length,
      0,
    );
    assert.ok(inputs.some((i) => i.type === 'function_call' && i.call_id === 'call_publish'));
  }
  if (renderAfterPublication) {
    assert.ok(
      requests[2].input.some(
        (i) =>
          i.type === 'function_call_output' && JSON.stringify(i.output).includes('syncedRevision'),
      ),
    );
  }
  process.stdout.write(
    `PASS: the packaged runner resumed the ${denied ? 'denied' : 'approved'} Codex tool continuation after process replacement, with exactly one continuation request and no external network.\n`,
  );
} finally {
  server.closeAllConnections();
  server.close();
}
