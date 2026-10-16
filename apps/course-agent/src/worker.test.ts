import { describe, expect, it } from 'vitest';

import { isAuthorized } from './auth.js';
import { createDeferred } from './deferred.js';
import { parseRoute } from './routes.js';
import { ChatRequestSchema } from './schemas.js';
import { buildInstructions } from './system-prompt.js';

const UUID = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('isAuthorized', () => {
  it('accepts the exact bearer token', () => {
    expect(isAuthorized('Bearer secret-token', 'secret-token')).toBe(true);
  });

  it('rejects a wrong, missing, or unconfigured token', () => {
    expect(isAuthorized('Bearer wrong-token!', 'secret-token')).toBe(false);
    expect(isAuthorized('Bearer secret', 'secret-token')).toBe(false);
    expect(isAuthorized(null, 'secret-token')).toBe(false);
    expect(isAuthorized('Bearer ', undefined)).toBe(false);
  });
});

describe('parseRoute', () => {
  it('parses the chat and messages routes', () => {
    expect(parseRoute(`/conversations/${UUID}/chat`)).toEqual({
      conversationId: UUID,
      action: 'chat',
    });
    expect(parseRoute(`/conversations/${UUID}/messages`)).toEqual({
      conversationId: UUID,
      action: 'messages',
    });
  });

  it('rejects other paths', () => {
    expect(parseRoute('/conversations/not-a-uuid/chat')).toBeNull();
    expect(parseRoute(`/conversations/${UUID}/other`)).toBeNull();
    expect(parseRoute(`/agents/conversation/${UUID}`)).toBeNull();
    expect(parseRoute(`/conversations/${UUID}/chat/extra`)).toBeNull();
  });
});

describe('ChatRequestSchema', () => {
  const message = { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] };

  it('accepts a single user text message with optional context', () => {
    expect(ChatRequestSchema.safeParse({ message }).success).toBe(true);
    expect(
      ChatRequestSchema.safeParse({
        message,
        context: { courseTitle: 'Intro to Programming', courseShortName: 'CS 101' },
      }).success,
    ).toBe(true);
  });

  it('rejects assistant messages, empty text, and multiple parts', () => {
    expect(
      ChatRequestSchema.safeParse({ message: { ...message, role: 'assistant' } }).success,
    ).toBe(false);
    expect(
      ChatRequestSchema.safeParse({ message: { ...message, parts: [{ type: 'text', text: '' }] } })
        .success,
    ).toBe(false);
    expect(
      ChatRequestSchema.safeParse({
        message: { ...message, parts: [message.parts[0], message.parts[0]] },
      }).success,
    ).toBe(false);
  });
});

describe('buildInstructions', () => {
  it('includes the course when context is provided', () => {
    expect(
      buildInstructions({ courseTitle: 'Intro to Programming', courseShortName: 'CS 101' }),
    ).toContain('"CS 101: Intro to Programming"');
    expect(buildInstructions(undefined)).toContain('a PrairieLearn course');
  });
});

describe('createDeferred', () => {
  it('keeps the first settlement', async () => {
    const deferred = createDeferred<number>();
    deferred.resolve(1);
    deferred.reject(new Error('ignored'));
    deferred.resolve(2);
    await expect(deferred.promise).resolves.toBe(1);
  });
});
