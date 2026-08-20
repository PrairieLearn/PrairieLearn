import { assert, describe, expect, it } from 'vitest';

import { handleSessionStoreRequest, sessionPartKey } from './session-store.js';

describe('session store parts', () => {
  it('orders immutable parts lexicographically and escapes provider keys', () => {
    assert.equal(
      sessionPartKey(
        'conversation-1',
        { projectKey: '/workspace/course', sessionId: 'session-1', subpath: 'subagents/agent-1' },
        12,
        'part-1',
      ),
      'conversations/conversation-1/claude/L3dvcmtzcGFjZS9jb3Vyc2U/c2Vzc2lvbi0x/c3ViYWdlbnRzL2FnZW50LTE/parts/000000000012-part-1.json',
    );
  });

  it('deduplicates append batches and retries, loads, and deletes the bound conversation parts', async () => {
    const objects = new Map<string, string>();
    const manifests = new Map<string, unknown>();
    const bucket = {
      async put(key: string, value: string) {
        objects.set(key, value);
      },
      async get(key: string) {
        const value = objects.get(key);
        return value === undefined
          ? null
          : {
              async json() {
                return JSON.parse(value);
              },
            };
      },
      async delete(key: string) {
        objects.delete(key);
      },
    } as unknown as R2Bucket;
    const storage = {
      async get(key: string) {
        return manifests.get(key);
      },
      async put(key: string, value: unknown) {
        manifests.set(key, value);
      },
      async list(options?: { prefix?: string }) {
        return new Map(
          [...manifests].filter(([key]) =>
            options?.prefix === undefined ? true : key.startsWith(options.prefix),
          ),
        );
      },
      async delete(keys: string | string[]) {
        for (const key of Array.isArray(keys) ? keys : [keys]) manifests.delete(key);
      },
    } as unknown as DurableObjectStorage;
    const entry = { type: 'user', uuid: 'entry-1' };
    const call = async (path: string, body: unknown) =>
      await handleSessionStoreRequest({
        request: new Request(`http://session${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        bucket,
        storage,
        conversationId: 'conversation-real-id',
      });
    const key = { projectKey: '/workspace/course', sessionId: 'session-1' };

    assert.deepEqual(await (await call('/append', { key, entries: [entry, entry] })).json(), {
      appended: 1,
      deduplicated: 1,
    });
    assert.deepEqual(await (await call('/append', { key, entries: [entry] })).json(), {
      appended: 0,
      deduplicated: 1,
    });
    assert.deepEqual(await (await call('/load', { key })).json(), { entries: [entry] });
    assert.equal(
      [...objects.keys()].every((part) => part.startsWith('conversations/conversation-real-id/')),
      true,
    );
    assert.deepEqual(await (await call('/delete', { key })).json(), { deleted: 1 });
    assert.equal(objects.size, 0);
  });

  it('rejects session keys outside the bound course workspace', async () => {
    const call = async (key: unknown) =>
      await handleSessionStoreRequest({
        request: new Request('http://session/append', {
          method: 'POST',
          body: JSON.stringify({ key, entries: [{ type: 'user' }] }),
        }),
        bucket: {} as R2Bucket,
        storage: {} as DurableObjectStorage,
        conversationId: 'conversation-1',
      });

    await expect(call({ projectKey: '/tmp/attacker', sessionId: 'session-1' })).rejects.toThrow(
      /workspace\/course/,
    );
  });
});
