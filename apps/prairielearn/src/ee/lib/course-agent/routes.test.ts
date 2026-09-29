import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { ChatError } from '@prairielearn/course-agent-contract';

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  watch: vi.fn(),
  unsubscribe: vi.fn(),
  errorHandler: vi.fn(),
}));
vi.mock('../../../lib/client/page-context.js', () => ({
  extractPageContext: () => ({
    course: { id: '1' },
    authz_data: { user: { id: '1' }, authn_user: { id: '1' } },
  }),
}));
vi.mock('../../../models/course-agent-conversation.js', () => ({
  selectConversation: async () => ({ id: '1' }),
}));
vi.mock('./service.js', () => ({
  provider: async () => ({ getSnapshot: mocks.getSnapshot, watch: mocks.watch }),
  prepare: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock('./events.js', () => ({ subscribe: async () => mocks.unsubscribe }));
vi.mock('./host-tools.js', () => ({ dispatchHostTool: vi.fn() }));
vi.mock('./usage.js', () => ({ recordUsage: vi.fn() }));

import router from './routes.js';

const app = express();
app.use(router);
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    mocks.errorHandler(error);
    res.status(500).end();
  },
);
let server: ReturnType<typeof app.listen>;
let url: string;
beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/1/events`;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);
beforeEach(() => vi.resetAllMocks());

test('sends authentication failure through SSE without invoking the HTML error handler', async () => {
  mocks.getSnapshot.mockRejectedValue(new ChatError(401, 'Authentication failed'));
  const response = await fetch(url);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(await response.text()).toContain(
    'event: connection-error\ndata: {"message":"Authentication failed"}',
  );
  expect(mocks.watch).not.toHaveBeenCalled();
  expect(mocks.unsubscribe).toHaveBeenCalled();
  expect(mocks.errorHandler).not.toHaveBeenCalled();
});

test('ends a failed WebSocket connection cleanly and hides internal error details', async () => {
  mocks.getSnapshot.mockResolvedValue({ messages: [], revision: 0 });
  mocks.watch.mockRejectedValue(new Error('private transport details'));
  const response = await fetch(url);
  const body = await response.text();
  expect(body).toContain('event: connection-error');
  expect(body).toContain('Your draft is preserved');
  expect(body).not.toContain('private transport details');
  expect(mocks.unsubscribe).toHaveBeenCalled();
  expect(mocks.errorHandler).not.toHaveBeenCalled();
});
