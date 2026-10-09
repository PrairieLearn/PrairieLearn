import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from 'ai';
import { expect, it } from 'vitest';

it('replays a response without copying prior text or adding another assistant message', async () => {
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'response' },
    { type: 'text-start', id: 'before' },
    { type: 'text-delta', id: 'before', delta: '1\n2' },
    { type: 'text-end', id: 'before' },
    { type: 'data-steering', data: { id: 'steer', text: 'hello?' } },
    { type: 'text-start', id: 'after' },
    { type: 'text-delta', id: 'after', delta: '3' },
    { type: 'text-end', id: 'after' },
    { type: 'finish' },
  ];
  const chat = new Chat<UIMessage>({
    messages: [
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Count' }] },
      { id: 'response', role: 'assistant', parts: [{ type: 'text', text: '1\n2' }] },
    ],
    transport: new DefaultChatTransport({
      api: 'http://localhost/chat',
      fetch: async () =>
        new Response(
          chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        ),
    }),
  });
  await chat.resumeStream();
  expect(chat.messages).toHaveLength(2);
  expect(chat.messages[1].parts.filter((p) => p.type === 'text').map((p) => p.text)).toEqual([
    '1\n2',
    '3',
  ]);
  await chat.resumeStream();
  expect(chat.messages).toHaveLength(2);
  expect(chat.messages[1].parts.filter((p) => p.type === 'text').map((p) => p.text)).toEqual([
    '1\n2',
    '3',
  ]);
});
