import { describe, expect, it } from 'vitest';

import { parseChatRequest } from './chat-request.js';

const message = { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] };
const context = { courseTitle: 'Intro to Programming', courseShortName: 'CS 101' };

describe('parseChatRequest', () => {
  it('accepts a user text message, with or without context', async () => {
    expect(await parseChatRequest({ message })).toEqual({ message, context: undefined });
    expect(await parseChatRequest({ message, context })).toEqual({ message, context });
  });

  it('rejects messages that are not valid UI messages', async () => {
    expect(await parseChatRequest({ message: { role: 'user', text: 'Hello' } })).toBeNull();
    expect(await parseChatRequest({ message: { ...message, parts: 'Hello' } })).toBeNull();
    expect(await parseChatRequest(null)).toBeNull();
  });

  it('accepts only a single non-empty text part from the user', async () => {
    expect(await parseChatRequest({ message: { ...message, role: 'assistant' } })).toBeNull();
    expect(
      await parseChatRequest({ message: { ...message, parts: [{ type: 'text', text: '  ' }] } }),
    ).toBeNull();
    expect(
      await parseChatRequest({
        message: { ...message, parts: [message.parts[0], message.parts[0]] },
      }),
    ).toBeNull();
    expect(
      await parseChatRequest({
        message: { ...message, parts: [{ type: 'text', text: 'x'.repeat(20_001) }] },
      }),
    ).toBeNull();
  });
});
