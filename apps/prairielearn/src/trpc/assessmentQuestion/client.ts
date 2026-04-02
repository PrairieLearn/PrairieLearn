import { createTRPCClient, httpLink, splitLink } from '@trpc/client';
import superjson from 'superjson';

import {
  getAssessmentQuestionTrpcChunkUrl,
  getAssessmentQuestionTrpcUrl,
} from '../../lib/client/url.js';

import type { AssessmentQuestionRouter } from './trpc.js';

/**
 * Procedure paths that must be routed to chunk servers because they
 * execute question code (via questionServers.getModule().render()).
 * Keep in sync with manualGradingChunkRouter in manual-grading.ts.
 */
const CHUNK_PROCEDURE_PATHS = new Set([
  'manualGrading.aiGroupInstanceQuestions',
  'manualGrading.aiGradeInstanceQuestions',
]);

export function createAssessmentQuestionTrpcClient({
  csrfToken,
  courseInstanceId,
  assessmentId,
  assessmentQuestionId,
  urlBase = '',
}: {
  csrfToken: string;
  courseInstanceId: string;
  assessmentId: string;
  assessmentQuestionId: string;
  urlBase?: string;
}) {
  const urlArgs = { courseInstanceId, assessmentId, assessmentQuestionId };
  const commonHeaders = {
    'X-TRPC': 'true',
    'X-CSRF-Token': csrfToken,
  };

  return createTRPCClient<AssessmentQuestionRouter>({
    links: [
      splitLink({
        // Route AI grading procedures to chunk servers via /trpc-chunk.
        condition: (op) => CHUNK_PROCEDURE_PATHS.has(op.path),
        true: httpLink({
          url: `${urlBase}${getAssessmentQuestionTrpcChunkUrl(urlArgs)}`,
          headers: commonHeaders,
          transformer: superjson,
        }),
        false: httpLink({
          url: `${urlBase}${getAssessmentQuestionTrpcUrl(urlArgs)}`,
          headers: commonHeaders,
          transformer: superjson,
        }),
      }),
    ],
  });
}
