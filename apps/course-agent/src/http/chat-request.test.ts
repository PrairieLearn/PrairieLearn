import { describe, expect, it } from 'vitest';

import { parseChatRequest } from './chat-request.js';

const message = { role: 'user', parts: [{ type: 'text', text: 'Hello' }] };
const context = { courseTitle: 'Intro to Programming', courseShortName: 'CS 101' };

describe('parseChatRequest', () => {
  it('accepts a user text message, with or without context', () => {
    expect(parseChatRequest({ message })).toEqual({ message });
    expect(parseChatRequest({ message, context })).toEqual({ message, context });
  });

  it('rejects messages that are not valid UI messages', () => {
    expect(parseChatRequest({ message: { role: 'user', text: 'Hello' } })).toBeNull();
    expect(parseChatRequest({ message: { ...message, parts: 'Hello' } })).toBeNull();
    expect(parseChatRequest(null)).toBeNull();
  });

  it('rejects invalid course context', () => {
    expect(
      parseChatRequest({ message, context: { courseTitle: 'Missing short name' } }),
    ).toBeNull();
    expect(
      parseChatRequest({ message, context: { ...context, courseTitle: 'x'.repeat(501) } }),
    ).toBeNull();
  });

  it('does not use caller-supplied message IDs', () => {
    expect(parseChatRequest({ message: { ...message, id: 'caller-id' } })).toEqual({ message });
  });

  it('preserves whitespace in non-empty messages', () => {
    const padded = { ...message, parts: [{ type: 'text', text: '  Hello  ' }] };
    expect(parseChatRequest({ message: padded })).toEqual({ message: padded });
  });

  it('accepts only a single non-empty text part from the user', () => {
    expect(parseChatRequest({ message: { ...message, role: 'assistant' } })).toBeNull();
    expect(
      parseChatRequest({ message: { ...message, parts: [{ type: 'text', text: '  ' }] } }),
    ).toBeNull();
    expect(
      parseChatRequest({
        message: { ...message, parts: [message.parts[0], message.parts[0]] },
      }),
    ).toBeNull();
    expect(
      parseChatRequest({
        message: { ...message, parts: [{ type: 'text', text: 'x'.repeat(20_001) }] },
      }),
    ).toBeNull();
  });
});
