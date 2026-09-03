import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runCodex } from './run-codex.mjs';

afterEach(() => vi.unstubAllEnvs());

// Opt in with the same binary version pinned in Dockerfile. Only localhost receives requests.
it.skipIf(!process.env.COURSE_AGENT_TEST_CODEX)(
  'streams real Codex app-server deltas before the mocked model finishes',
  async () => {
    vi.stubEnv('OPENAI_API_KEY', 'local-mock-key');
    const cwd = await mkdtemp(join(tmpdir(), 'pl-course-agent-test-'));
    const notifications = [];
    let complete;
    const server = createServer((request, response) => {
      if (!request.url.endsWith('/responses')) {
        response.writeHead(404).end();
        return;
      }
      expect(request.headers.authorization).toBe('Bearer local-mock-key');
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (event) =>
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const item = {
        id: 'message-1',
        type: 'message',
        role: 'assistant',
        phase: 'final_answer',
        content: [],
      };
      send({ type: 'response.created', response: { id: 'response-1', status: 'in_progress' } });
      send({ type: 'response.output_item.added', output_index: 0, item });
      send({
        type: 'response.content_part.added',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '', annotations: [] },
      });
      send({
        type: 'response.output_text.delta',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: 'Hello',
      });
      complete = () => {
        send({
          type: 'response.output_text.delta',
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          delta: ' world',
        });
        const part = { type: 'output_text', text: 'Hello world', annotations: [] };
        send({
          type: 'response.output_text.done',
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          text: part.text,
        });
        send({
          type: 'response.content_part.done',
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          part,
        });
        send({
          type: 'response.output_item.done',
          output_index: 0,
          item: { ...item, status: 'completed', content: [part] },
        });
        send({
          type: 'response.completed',
          response: {
            id: 'response-1',
            status: 'completed',
            output: [],
            usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
          },
        });
        response.end();
      };
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const running = runCodex({
      command: process.env.COURSE_AGENT_TEST_CODEX,
      cwd,
      model: 'gpt-5.4',
      prompt: 'Say hello.',
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      emit: (event) => notifications.push(event),
    });
    // Attach immediately so an initialization failure is reported by the test, not as an unhandled rejection.
    let failure;
    void running.catch((error) => {
      failure = error;
    });
    try {
      await vi.waitFor(
        () => {
          if (failure) throw failure;
          expect(notifications).toContainEqual(
            expect.objectContaining({
              method: 'item/agentMessage/delta',
              params: expect.objectContaining({ delta: 'Hello' }),
            }),
          );
        },
        { timeout: 15000 },
      );
      expect(notifications.some((event) => event.method === 'turn/completed')).toBe(false);
      complete();
      complete = undefined;
      await running;
      expect(notifications).toContainEqual(
        expect.objectContaining({
          method: 'item/agentMessage/delta',
          params: expect.objectContaining({ delta: ' world' }),
        }),
      );
      expect(notifications.at(-1).method).toBe('turn/completed');
    } finally {
      complete?.();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await running.catch(() => {});
      await rm(cwd, { recursive: true, force: true });
    }
  },
  25000,
);
