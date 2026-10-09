import assert from 'node:assert/strict';

import { test } from 'vitest';

import { HostTools } from '../src/host-tools.js';

function executor(id: string) {
  const sent: { id: string }[] = [];
  return {
    id,
    sent,
    send(data: string) {
      sent.push(JSON.parse(data));
    },
  };
}
const reply = (id: string) => ({
  type: 'host-tool-result',
  id,
  result: { ok: true, output: 'hello' },
});

test('one executor receives the call; other tabs and late results cannot resolve it', async () => {
  const tools = new HostTools(),
    a = executor('a'),
    b = executor('b');
  const pending = tools.call('host_echo', { text: 'hello' }, [a, b]);
  assert.equal(a.sent.length, 1);
  assert.equal(b.sent.length, 0);
  const id = a.sent[0]!.id;
  let done = false;
  void pending.then(() => {
    done = true;
  });
  tools.receive(b.id, reply(id));
  tools.receive(a.id, reply(crypto.randomUUID()));
  await Promise.resolve();
  assert.equal(done, false);
  tools.receive(a.id, reply(id));
  assert.deepEqual(await pending, {
    success: true,
    contentItems: [{ type: 'inputText', text: '"hello"' }],
  });
  tools.receive(a.id, reply(id));
});
test('missing executor, timeout, disconnect and Stop fail without replay', async () => {
  const tools = new HostTools(),
    a = executor('a');
  assert.equal((await tools.call('host_echo', {}, [])).success, false);
  assert.equal((await tools.call('host_echo', {}, [a], 1)).success, false);
  for (const executorId of ['a', undefined]) {
    const pending = tools.call('host_echo', {}, [a]);
    tools.cancel('Cancelled', executorId);
    tools.receive(a.id, reply(a.sent.at(-1)!.id));
    assert.equal((await pending).success, false);
  }
  assert.equal(a.sent.length, 3);
});
test('host errors become native failed results', async () => {
  const tools = new HostTools(),
    a = executor('a');
  const pending = tools.call('host_echo', {}, [a]);
  tools.receive(a.id, {
    type: 'host-tool-result',
    id: a.sent[0]!.id,
    result: { ok: false, error: 'Failed' },
  });
  assert.deepEqual(await pending, {
    success: false,
    contentItems: [{ type: 'inputText', text: 'Failed' }],
  });
});
