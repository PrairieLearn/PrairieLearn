import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import { getAssessmentQuestionTrpcUrl } from '../../lib/client/url.js';

import type { AssessmentQuestionRouter } from './trpc.js';

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
  return createTRPCClient<AssessmentQuestionRouter>({
    links: [
      httpLink({
        url: `${urlBase}${getAssessmentQuestionTrpcUrl({ courseInstanceId, assessmentId, assessmentQuestionId })}`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
