import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { getRouterPaths, handleTrpcError } from '../../lib/trpc.js';

import { createContext, t } from './init.js';
import { manualGradingChunkRouter, manualGradingMainRouter } from './manual-grading.js';

// Main-server router: DB-only procedures.
// Mounted at .../assessment_question/:aqid/trpc
const assessmentQuestionMainRouter = t.router({
  manualGrading: manualGradingMainRouter,
});

// Chunk-server router: procedures that execute question code.
// Mounted at .../assessment_question/:aqid/trpc-chunk
// The ALB routes /trpc-chunk requests to chunk servers.
const assessmentQuestionChunkRouter = t.router({
  manualGrading: manualGradingChunkRouter,
});

/** Procedure paths that must be routed to chunk servers. Derived from the chunk router at runtime. */
export const assessmentQuestionChunkPaths = getRouterPaths(assessmentQuestionChunkRouter);

// This gives the client a single type covering all procedures
// while the actual HTTP traffic is split across two endpoints
// by splitLink in client.ts.
const _assessmentQuestionCombinedRouter = t.router({
  manualGrading: t.mergeRouters(manualGradingMainRouter, manualGradingChunkRouter),
});
export type AssessmentQuestionRouter = typeof _assessmentQuestionCombinedRouter;

export const assessmentQuestionTrpcRouter = createExpressMiddleware({
  router: assessmentQuestionMainRouter,
  createContext,
  onError: handleTrpcError,
});

export const assessmentQuestionTrpcChunkRouter = createExpressMiddleware({
  router: assessmentQuestionChunkRouter,
  createContext,
  onError: handleTrpcError,
});
