import { createTRPCClient } from '@trpc/client';

import { createChunkSplitLink } from '../../lib/client/trpc.js';
import {
  getAssessmentQuestionTrpcChunkUrl,
  getAssessmentQuestionTrpcUrl,
} from '../../lib/client/url.js';

import type { AssessmentQuestionChunkRouter, AssessmentQuestionRouter } from './trpc.js';

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

  return createTRPCClient<AssessmentQuestionRouter>({
    links: [
      createChunkSplitLink<AssessmentQuestionChunkRouter>()({
        mainUrl: `${urlBase}${getAssessmentQuestionTrpcUrl(urlArgs)}`,
        chunkUrl: `${urlBase}${getAssessmentQuestionTrpcChunkUrl(urlArgs)}`,
        csrfToken,
        chunkPaths: [
          'manualGrading.aiGroupInstanceQuestions',
          'manualGrading.aiGradeInstanceQuestions',
        ],
      }),
    ],
  });
}
