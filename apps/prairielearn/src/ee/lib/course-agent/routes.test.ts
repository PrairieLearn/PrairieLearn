import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { TRPCError } from '@trpc/server';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { ChatError } from '@prairielearn/course-agent-contract';
import { HttpStatusError } from '@prairielearn/error';

import * as pageContext from '../../../lib/client/page-context.js';
import * as conversations from '../../../models/course-agent-conversation.js';

import * as events from './events.js';
import { createCloudflareProvider } from './provider.js';
import router from './routes.js';
import * as service from './service.js';

const mocks = {
  selectConversation: vi.fn(),
  getSnapshot: vi.fn(),
  watch: vi.fn(),
  unsubscribe: vi.fn(),
  errorHandler: vi.fn(),
};

const app = express();
app.use(router);
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    mocks.errorHandler(error);
    res.status(error instanceof HttpStatusError ? error.status : 500).end();
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
beforeEach(() => {
  vi.resetAllMocks();
  mocks.selectConversation.mockResolvedValue({ id: '1' });
  vi.spyOn(pageContext, 'extractPageContext').mockReturnValue({
    course: { id: '1' },
    authz_data: { user: { id: '1' }, authn_user: { id: '1' } },
  } as ReturnType<typeof pageContext.extractPageContext>);
  vi.spyOn(conversations, 'selectConversation').mockImplementation(mocks.selectConversation);
  vi.spyOn(service, 'provider').mockResolvedValue({
    ...createCloudflareProvider(new URL('http://localhost'), 'test'),
    getSnapshot: mocks.getSnapshot,
    watch: mocks.watch,
  });
  vi.spyOn(events, 'subscribe').mockResolvedValue(mocks.unsubscribe);
});
afterEach(() => vi.restoreAllMocks());

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
  mocks.getSnapshot.mockResolvedValue({ messages: [], operationNumber: 0 });
  mocks.watch.mockRejectedValue(new Error('private transport details'));
  const response = await fetch(url);
  const body = await response.text();
  expect(body).toContain('event: connection-error');
  expect(body).toContain('Your draft is preserved');
  expect(body).not.toContain('private transport details');
  expect(mocks.unsubscribe).toHaveBeenCalled();
  expect(mocks.errorHandler).not.toHaveBeenCalled();
});

test.each(['events', 'stream'])(
  'preserves model authorization/not-found HTTP status on %s',
  async (path) => {
    mocks.selectConversation.mockRejectedValue(
      new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' }),
    );
    const response = await fetch(url.replace(/events$/, path));
    expect(response.status).toBe(404);
    expect(mocks.errorHandler.mock.calls[0][0]).toBeInstanceOf(HttpStatusError);
  },
);
