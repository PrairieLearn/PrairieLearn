import { randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { type ErrorRequestHandler, type Request, Router, text } from 'express';
import { z } from 'zod';

import {
  ChatError,
  approvalDisplaySchema,
  approvalSchema,
  executionAuthorizationSchema,
  modelReservationSchema,
  modelSettlementSchema,
  type serviceScopeSchema,
  verifyServiceRequest,
} from '@prairielearn/course-agent-contract';
import * as Sentry from '@prairielearn/sentry';
import { parseRequestBody } from '@prairielearn/zod';

import { config } from '../../../lib/config.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import {
  type AgentScope,
  recordConversationFinished,
  selectOptionalConversationByExternalId,
  selectOptionalConversationContext,
} from '../../../models/course-agent-conversation.js';
import { selectOptionalProposal } from '../../../models/course-agent-proposal.js';

import { getAgentAccounting } from './accounting.js';
import { authorize, complete, destination, prepare } from './service.js';
import { modelPricing } from './usage.js';

const router = Router();
const scopes = new WeakMap<Request, ReturnType<typeof serviceScopeSchema.parse>>();
router.use(text({ type: 'application/json', limit: '3mb' }));
router.use(
  typedAsyncHandler(async (req, res, next) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    const headers = new Headers();
    for (const name of [
      'X-Course-Agent-Scope',
      'X-Course-Agent-Time',
      'X-Course-Agent-Signature',
    ]) {
      const value = req.get(name);
      if (value) headers.set(name, value);
    }
    const scope = await verifyServiceRequest(
      new Request(new URL(req.originalUrl, 'http://pl.internal'), { method: req.method, headers }),
      config.courseAgent?.serviceToken ?? '',
      'pl-api',
      raw,
    );
    if (!scope) {
      res.status(401).json({
        code: 'unauthenticated',
        message: 'Service authentication required.',
        retryable: false,
        requestId: randomUUID(),
      });
      return;
    }
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new ChatError(400, 'Expected a JSON request body.', 'invalid_json');
    }
    scopes.set(req, scope);
    next();
  }),
);

// Service scope is authenticated before handlers run; catalog ownership is
// checked separately for product/new-work calls. Existing financial receipts
// can still settle after access is revoked or the course is removed.
const scopeFor = (req: Request) => scopes.get(req)!;
const actorFor = (scope: ReturnType<typeof scopeFor>): AgentScope => ({
  course_id: scope.courseId,
  user_id: scope.userId,
  authn_user_id: scope.authnUserId,
});

async function conversationFor(scope: ReturnType<typeof scopeFor>, newWork = false) {
  const actor = actorFor(scope);
  const row = await selectOptionalConversationByExternalId(actor, scope.conversationId);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
  const course = await authorize(actor, newWork);
  if (newWork) {
    const target = destination(course);
    if (target.repository !== row.repository || target.branch !== row.branch) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'The course repository changed. Start a new conversation.',
      });
    }
  }
  return row;
}
router.post(
  '/context-status',
  typedAsyncHandler(async (req, res) => {
    const scope = scopeFor(req);
    const row = await selectOptionalConversationContext(scope.conversationId);
    if (row && (row.course_id !== scope.courseId || row.user_id !== scope.userId)) {
      throw new ChatError(409, 'Conversation binding changed.');
    }
    res.json({ status: row ? (row.deleted_at ? 'soft_deleted' : 'present') : 'absent' });
  }),
);
router.post(
  '/permissions',
  typedAsyncHandler(async (req, res) => {
    await conversationFor(scopeFor(req), true);
    res.json({ allowed: true });
  }),
);
router.post(
  '/execution/authorize',
  typedAsyncHandler(async (req, res) => {
    const scope = scopeFor(req);
    const input = parseRequestBody(req, executionAuthorizationSchema);
    await conversationFor(scope, true);
    res.json(await getAgentAccounting().authorize(scope, input));
  }),
);
router.post(
  '/execution/release',
  typedAsyncHandler(async (req, res) => {
    const { actionId, grantId } = parseRequestBody(
      req,
      z.object({ actionId: z.uuid(), grantId: z.uuid() }),
    );
    await getAgentAccounting().release(scopeFor(req), actionId, grantId);
    res.json({ accepted: true });
  }),
);
router.post(
  '/model/reserve',
  typedAsyncHandler(async (req, res) => {
    const scope = scopeFor(req);
    const input = parseRequestBody(req, modelReservationSchema);
    const existing = await getAgentAccounting().lookup(scope, input);
    if (existing) {
      res.json(existing);
      return;
    }
    await conversationFor(scope, true);
    const prices = modelPricing(input.model);
    if (!prices) throw new ChatError(503, 'Model pricing is unavailable.');
    res.json(await getAgentAccounting().reserve(scope, input, prices));
  }),
);
router.post(
  '/model/settle',
  typedAsyncHandler(async (req, res) => {
    const input = parseRequestBody(req, modelSettlementSchema);
    await getAgentAccounting().settle(scopeFor(req), input);
    res.json({ accepted: true });
  }),
);
router.post(
  '/conversations/finished',
  typedAsyncHandler(async (req, res) => {
    const scope = scopeFor(req);
    const { finishedAt } = parseRequestBody(
      req,
      z.object({
        finishedAt: z
          .number()
          .int()
          .positive()
          .max(Date.now() + 60_000),
      }),
    );
    const row = await selectOptionalConversationByExternalId(actorFor(scope), scope.conversationId);
    if (row) await recordConversationFinished(row.id, new Date(finishedAt));
    res.json({ accepted: true });
  }),
);
router.post(
  '/publications',
  typedAsyncHandler(async (req, res) => {
    const scope = scopeFor(req);
    const input = parseRequestBody(req, z.object({ id: z.uuid(), capture: approvalSchema }));
    const c = await conversationFor(scope, true);
    await prepare(actorFor(scope), c, { id: input.id, name: 'push_sync', args: input.capture });
    res.status(202).json({ id: input.id });
  }),
);
router.post(
  '/publications/status',
  typedAsyncHandler(async (req, res) => {
    const scope = scopeFor(req);
    const { id } = parseRequestBody(req, z.object({ id: z.uuid() }));
    const c = await conversationFor(scope);
    const row = await selectOptionalProposal(c.id, id);
    if (!row) {
      res.json({ status: 'absent' });
      return;
    }
    if (row.outcome !== null) {
      res.json({
        status: 'complete',
        result: {
          id,
          result: row.outcome,
          success: row.outcome_success!,
          display: {
            name: 'push_sync',
            value: {
              ...approvalDisplaySchema.parse(row.payload),
              digest: row.digest,
              status: row.decision ? 'approved' : 'denied',
              result: row.outcome,
            },
          },
        },
      });
      return;
    }
    res.json({
      status: row.prepared
        ? row.decision === null
          ? 'awaiting_approval'
          : 'working'
        : 'preparing',
      digest: row.digest,
      error: row.error,
    });
  }),
);
router.post(
  '/publications/advance',
  typedAsyncHandler(async (req, res) => {
    const scope = scopeFor(req);
    const { id } = parseRequestBody(req, z.object({ id: z.uuid() }));
    const c = await conversationFor(scope);
    const row = await selectOptionalProposal(c.id, id);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Proposal not found.' });
    if (row.outcome === null && row.decision !== null) {
      await complete(actorFor(scope), c, {
        id,
        digest: row.digest,
        decision: row.decision ? 'approve' : 'deny',
      });
    }
    res.json({ accepted: true });
  }),
);
const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const status =
    error instanceof TRPCError
      ? getHTTPStatusCodeFromError(error)
      : error instanceof ChatError
        ? error.status
        : error instanceof SyntaxError || error instanceof z.ZodError
          ? 400
          : typeof error === 'object' && error !== null && 'status' in error && error.status === 413
            ? 413
            : 500;
  if (status === 500) Sentry.captureException(error);
  if (error instanceof ChatError && error.code === 'hourly_limit') {
    res.setHeader('Retry-After', String(3600 - (Math.floor(Date.now() / 1000) % 3600)));
  }
  res.status(status).json({
    code:
      error instanceof ChatError
        ? error.code
        : status === 429
          ? 'policy_refused'
          : status >= 500
            ? 'unavailable'
            : 'invalid_request',
    message:
      status === 500
        ? 'Course agent API failed.'
        : error instanceof Error
          ? error.message
          : 'Invalid request.',
    retryable: status >= 500,
    requestId: randomUUID(),
  });
};
router.use(errors);
export default router;
