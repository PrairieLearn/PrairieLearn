import { getAgentByName } from 'agents';
import type { UIMessageChunk } from 'ai';

import { Conversation as BaseConversation } from '../src/conversation/conversation.js';
import worker from '../src/worker.js';

export class Conversation extends BaseConversation {
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private calls = 0;

  protected override createReply(signal: AbortSignal | undefined, messageId: string) {
    this.calls++;
    return Promise.resolve(
      new ReadableStream<UIMessageChunk>({
        start: (controller) => {
          this.controller = controller;
          controller.enqueue({ type: 'start', messageId });
          controller.enqueue({ type: 'text-start', id: 'text' });
          signal?.addEventListener('abort', () => this.finish(), { once: true });
          if (signal?.aborted) this.finish();
        },
      }),
    );
  }

  advance(text: string) {
    this.controller?.enqueue({ type: 'text-delta', id: 'text', delta: text });
  }

  finish() {
    if (!this.controller) return;
    this.controller.enqueue({ type: 'text-end', id: 'text' });
    this.controller.enqueue({ type: 'finish' });
    this.controller.close();
    this.controller = null;
  }

  fail() {
    this.controller?.error(new Error('Scripted provider failure'));
    this.controller = null;
  }

  stats() {
    return { calls: this.calls, ready: this.controller !== null };
  }
}

export default {
  async fetch(request, env) {
    const route = /^\/__test\/([^/]+)\/(advance|finish|fail|stats)$/.exec(
      new URL(request.url).pathname,
    );
    if (!route) return worker.fetch(request, env);
    if (request.headers.get('Authorization') !== `Bearer ${env.PL_SERVICE_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    const conversation = await getAgentByName(env.Conversation, route[1]);
    if (route[2] === 'advance') await conversation.advance(await request.text());
    if (route[2] === 'finish') await conversation.finish();
    if (route[2] === 'fail') await conversation.fail();
    return Response.json(await conversation.stats());
  },
} satisfies ExportedHandler<
  Omit<Env, 'Conversation'> & { Conversation: DurableObjectNamespace<Conversation> }
>;
