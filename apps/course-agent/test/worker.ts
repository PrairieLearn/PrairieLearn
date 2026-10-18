import { getAgentByName } from 'agents';
import type { UIMessageChunk } from 'ai';

import { Conversation as BaseConversation } from '../src/conversation/conversation.js';
import type { ModelEnvironment, ReplyInput } from '../src/conversation/runtime.js';
import worker from '../src/worker.js';

export class Conversation extends BaseConversation {
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private calls = 0;

  constructor(
    ctx: DurableObjectState,
    private readonly scriptedEnv: ModelEnvironment & { SCRIPTED_AUTO_REPLY?: string },
  ) {
    super(ctx, scriptedEnv);
  }

  protected override createReply(input: ReplyInput) {
    this.calls++;
    return Promise.resolve(
      new ReadableStream<UIMessageChunk>({
        start: (controller) => {
          this.controller = controller;
          controller.enqueue({ type: 'start', messageId: input.messageId });
          controller.enqueue({ type: 'text-start', id: 'text' });
          input.signal.addEventListener('abort', () => this.finish(), { once: true });
          if (input.signal.aborted) this.finish();
          if (this.scriptedEnv.SCRIPTED_AUTO_REPLY === 'true') {
            this.ctx.waitUntil(
              (async () => {
                const words =
                  'This is a scripted demonstration of resumable streaming. The reply continues while you refresh or switch conversations, and completed replies appear as unread until you view them.'.split(
                    ' ',
                  );
                for (const word of words) {
                  await new Promise((resolve) => setTimeout(resolve, 200));
                  if (input.signal.aborted || this.controller !== controller) return;
                  this.advance(`${word} `);
                }
                this.finish();
              })(),
            );
          }
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
    this.controller?.error(new Error('Scripted failure'));
    this.controller = null;
  }

  async seedHistory() {
    await this.persistMessages(
      Array.from({ length: 60 }, (_, index) => ({
        id: crypto.randomUUID(),
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        parts: [{ type: 'text' as const, text: `History ${index}` }],
      })),
    );
  }

  async stats() {
    const streams = await this.streams.list({ state: 'streaming' });
    return {
      calls: this.calls,
      ready: this.controller !== null,
      durableChunks: streams.reduce((total, stream) => total + stream.cursor, 0),
    };
  }
}
interface TestEnvironment extends ModelEnvironment {
  Conversation: DurableObjectNamespace<Conversation>;
  PL_SERVICE_TOKEN: string;
}
export default {
  async fetch(request, env) {
    const route = /^\/__test\/([^/]+)\/(advance|finish|fail|stats|seed)$/.exec(
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
    if (route[2] === 'seed') await conversation.seedHistory();
    return Response.json(await conversation.stats());
  },
} satisfies ExportedHandler<TestEnvironment>;
