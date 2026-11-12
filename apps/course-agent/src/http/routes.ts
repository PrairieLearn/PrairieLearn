import { getAgentByName } from 'agents';
import { Hono } from 'hono';

import {
  CreateConversationInput,
  MAX_ATTACHMENT_BYTES,
  MAX_THUMBNAIL_BYTES,
  RequestChangesResultSchema,
  UUID_PATTERN,
} from '@prairielearn/course-agent-types';

import { imageType, sentFileKey, thumbnailKey, uploadKey } from '../conversation/attachments.js';
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
  if (!UUID_PATTERN.test(c.req.param('id')!)) return c.notFound();
  await next();
});
conversations.use('/:id/uploads/:uploadId/*', async (c, next) => {
  if (!UUID_PATTERN.test(c.req.param('uploadId')!)) return c.notFound();
  await next();
});

/** A request body's declared size, if it is 1 to `max` bytes. R2 requires a known length. */
function bodySize(request: Request, max: number) {
  const size = Number(request.headers.get('Content-Length'));
  return request.body && Number.isSafeInteger(size) && size >= 1 && size <= max ? size : null;
}

// Uploads and thumbnails never change. PrairieLearn decides how they may display.
const CACHE_CONTROL = 'private, max-age=86400';

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
conversations.post('/:id/uploads', async (c) => {
  const size = bodySize(c.req.raw, MAX_ATTACHMENT_BYTES);
  if (size === null) return c.text(`Expected a file of 1 to ${MAX_ATTACHMENT_BYTES} bytes`, 400);
  // The conversation's Durable Object reserves room, so concurrent uploads can't overshoot the cap.
  const conversation = await getAgentByName(c.env.Conversation, c.req.param('id'));
  if (!(await conversation.reserveUpload(size))) {
    return c.text('This conversation has reached its attachment limit', 413);
  }
  const id = crypto.randomUUID();
  try {
    await c.env.CHECKPOINTS.put(uploadKey(c.req.param('id'), id), c.req.raw.body);
  } catch (error) {
    await conversation.releaseUpload(size);
    throw error;
  }
  return c.json({ id }, 201);
});

conversations.get('/:id/uploads/:uploadId', async (c) => {
  const upload = await c.env.CHECKPOINTS.get(uploadKey(c.req.param('id'), c.req.param('uploadId')));
  if (!upload) return c.notFound();
  return new Response(upload.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(upload.size),
      'Cache-Control': CACHE_CONTROL,
    },
  });
});

// The browser makes an image's preview, since Workers can't resize images without a paid service.
// Only an existing upload gets one, so thumbnails can't fill the bucket past the upload cap.
conversations.post('/:id/uploads/:uploadId/thumbnail', async (c) => {
  if (bodySize(c.req.raw, MAX_THUMBNAIL_BYTES) === null) {
    return c.text(`Expected a thumbnail of 1 to ${MAX_THUMBNAIL_BYTES} bytes`, 400);
  }
  const { id, uploadId } = c.req.param();
  if (!(await c.env.CHECKPOINTS.head(uploadKey(id, uploadId)))) return c.notFound();
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const contentType = imageType(bytes);
  if (!contentType) return c.text('Expected a PNG, JPEG, GIF, or WebP thumbnail', 415);
  await c.env.CHECKPOINTS.put(thumbnailKey(id, uploadId), bytes, { httpMetadata: { contentType } });
  return c.body(null, 204);
});

conversations.get('/:id/uploads/:uploadId/thumbnail', async (c) => {
  const thumbnail = await c.env.CHECKPOINTS.get(
    thumbnailKey(c.req.param('id'), c.req.param('uploadId')),
  );
  if (!thumbnail) return c.notFound();
  return new Response(thumbnail.body, {
    headers: {
      'Content-Type': thumbnail.httpMetadata!.contentType!,
      'Cache-Control': CACHE_CONTROL,
    },
  });
});

// A file the agent sent with `send_files`. Like an upload, it is served as a download.
conversations.get('/:id/sent-files/:fileId', async (c) => {
  if (!UUID_PATTERN.test(c.req.param('fileId'))) return c.notFound();
  const file = await c.env.CHECKPOINTS.get(sentFileKey(c.req.param('id'), c.req.param('fileId')));
  if (!file) return c.notFound();
  return new Response(file.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(file.size),
      'Cache-Control': CACHE_CONTROL,
    },
  });
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
