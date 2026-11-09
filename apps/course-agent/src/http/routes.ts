import { getAgentByName } from 'agents';
import { Hono } from 'hono';

import {
  CreateConversationInput,
  MAX_ATTACHMENT_BYTES,
  MAX_CONVERSATION_ATTACHMENTS,
  MAX_CONVERSATION_ATTACHMENT_BYTES,
  RequestChangesResultSchema,
} from '@prairielearn/course-agent-types';

import { uploadKey, uploadPrefix } from '../conversation/attachments.js';
import { reportError } from '../monitoring.js';

import { isAuthorized } from './auth.js';

// Set only while rotating PL_SERVICE_TOKEN, so it isn't a required secret in wrangler.jsonc.
const app = new Hono<{ Bindings: Env & { PL_SERVICE_TOKEN_PREVIOUS?: string } }>();

// PL's catalog is the existence/ownership authority for every conversation route.
// Only its authenticated server may create conversations or forward SDK traffic here.
app.use('*', async (c, next) => {
  const header = c.req.header('Authorization') ?? null;
  if (
    !isAuthorized(header, c.env.PL_SERVICE_TOKEN) &&
    !isAuthorized(header, c.env.PL_SERVICE_TOKEN_PREVIOUS)
  ) {
    return c.text('Unauthorized', 401);
  }
  await next();
});

// Local PL development uploads the authorized course's current files and Git history.
// The first message unpacks this archive; creation alone does not start a container.
app.post('/conversations/local', async (c) => {
  if (c.req.header('Content-Type') !== 'application/gzip' || !c.req.raw.body) {
    return c.text('Expected a gzip course archive', 400);
  }
  const directory = decodeURIComponent(c.req.header('X-PL-Course-Directory') ?? '.');
  if (directory.startsWith('/') || directory.split('/').includes('..')) {
    return c.text('Expected a relative course directory', 400);
  }
  const id = crypto.randomUUID();
  const archiveKey = `local-sources/${id}.tar.gz`;
  await c.env.CHECKPOINTS.put(archiveKey, c.req.raw.body);
  try {
    const conversation = await getAgentByName(c.env.Conversation, id);
    await conversation.initialize({ type: 'local', archiveKey, directory });
  } catch (error) {
    await c.env.CHECKPOINTS.delete(archiveKey);
    throw error;
  }
  return c.json({ id }, 201);
});

app.post('/conversations', async (c) => {
  const input = CreateConversationInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.text('Invalid request', 400);
  const id = crypto.randomUUID();
  const conversation = await getAgentByName(c.env.Conversation, id);
  await conversation.initialize({ type: 'github', ...input.data });
  return c.json({ id }, 201);
});

const conversations = new Hono<{ Bindings: Env }>();
conversations.use('/:id/*', async (c, next) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(c.req.param('id')!)) {
    return c.notFound();
  }
  await next();
});

conversations.post('/:id/resume', async (c) => {
  const conversation = await getAgentByName(c.env.Conversation, c.req.param('id'));
  try {
    if (!(await conversation.resume())) {
      return c.json({ error: 'Conversation is not blocked or is already recovering' }, 409);
    }
    return c.json({ recovered: true });
  } catch (error) {
    // This handled RPC failure would otherwise be returned as a successful HTTP handler.
    reportError(error);
    return c.json({ error: 'Could not recover the course agent' }, 503);
  }
});

// The browser uploads each attachment before sending the message that refers to it by ID.
// R2 requires a known length, which the Content-Length check also bounds.
conversations.post('/:id/uploads', async (c) => {
  const size = Number(c.req.header('Content-Length'));
  if (!c.req.raw.body || !Number.isSafeInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
    return c.text('Expected a file of at most 20 MB', 400);
  }
  // Uploads that were never sent count too. Concurrent uploads can overshoot the cap by a message.
  const { objects } = await c.env.CHECKPOINTS.list({ prefix: uploadPrefix(c.req.param('id')) });
  const total = objects.reduce((sum, object) => sum + object.size, 0);
  if (
    objects.length >= MAX_CONVERSATION_ATTACHMENTS ||
    total + size > MAX_CONVERSATION_ATTACHMENT_BYTES
  ) {
    return c.text('This conversation has reached its attachment limit', 413);
  }
  const id = crypto.randomUUID();
  await c.env.CHECKPOINTS.put(uploadKey(c.req.param('id'), id), c.req.raw.body);
  return c.json({ id }, 201);
});

conversations.get('/:id/reviews/:reviewId', async (c) => {
  const conversation = await getAgentByName(c.env.Conversation, c.req.param('id'));
  return c.json(await conversation.getReview(c.req.param('reviewId')));
});

// PrairieLearn may send a result more than once; the review ID makes repeats harmless.
conversations.post('/:id/reviews/:reviewId/outcome', async (c) => {
  const result = RequestChangesResultSchema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) return c.text('Invalid result', 400);
  const conversation = await getAgentByName(c.env.Conversation, c.req.param('id'));
  if (!(await conversation.recordReviewResult(c.req.param('reviewId'), result.data))) {
    return c.text('This review already has a different result', 409);
  }
  return c.json({ outcomeRecorded: true });
});

conversations.on('GET', ['/:id', '/:id/get-messages'], async (c) => {
  const conversation = await getAgentByName(c.env.Conversation, c.req.param('id'));
  return conversation.fetch(c.req.raw);
});

app.route('/conversations', conversations);
app.notFound((c) => c.text('Not found', 404));
app.onError((error, c) => {
  reportError(error);
  return c.json({ error: 'The course agent service failed' }, 500);
});

export default app;
