import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AssessmentQuestionsRouter } from '../trpc.js';

export type AssessmentQuestionsTrpcClient = ReturnType<typeof createAssessmentQuestionsTrpcClient>;

export function createAssessmentQuestionsTrpcClient(csrfToken: string) {
  return createTRPCClient<AssessmentQuestionsRouter>({
    links: [
      httpLink({
        url: typeof window === 'undefined' ? '' : window.location.pathname + '/trpc',
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
