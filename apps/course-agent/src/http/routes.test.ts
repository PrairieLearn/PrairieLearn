import { describe, expect, it } from 'vitest';

import { parseRoute } from './routes.js';

const UUID = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const BASE = 'https://course-agent.example.com';

describe('parseRoute', () => {
  it('matches the socket and snapshot routes', () => {
    expect(parseRoute(`${BASE}/conversations/${UUID}/socket`)).toEqual({
      conversationId: UUID,
      action: 'socket',
    });
    expect(parseRoute(`${BASE}/conversations/${UUID}/snapshot?x=1`)).toEqual({
      conversationId: UUID,
      action: 'snapshot',
    });
  });

  it('rejects other paths', () => {
    expect(parseRoute(`${BASE}/conversations/not-a-uuid/socket`)).toBeNull();
    expect(parseRoute(`${BASE}/conversations/${UUID}/other`)).toBeNull();
    expect(parseRoute(`${BASE}/agents/conversation/${UUID}`)).toBeNull();
    expect(parseRoute(`${BASE}/conversations/${UUID}/socket/extra`)).toBeNull();
  });
});
