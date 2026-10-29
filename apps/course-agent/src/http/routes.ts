import { getAgentByName } from 'agents';
import { Hono } from 'hono';

import { CreateConversationInput } from '@prairielearn/course-agent-types';

import { reportError } from '../monitoring.js';

import { isAuthorized } from './auth.js';

const app = new Hono<{ Bindings: Env }>();

// PL's catalog is the existence/ownership authority for every conversation route.
// Only its authenticated server may create conversations or forward SDK traffic here.
app.use('*', async (c, next) => {
  if (!isAuthorized(c.req.header('Authorization') ?? null, c.env.PL_SERVICE_TOKEN)) {
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
  const directory = decodeURIComponent(
    c.req.header('X-PL-Course-Directory') ?? c.req.header('X-Course-Directory') ?? '.',
  );
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
    return c.json({ error: 'Could not recover workspace' }, 503);
  }
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
