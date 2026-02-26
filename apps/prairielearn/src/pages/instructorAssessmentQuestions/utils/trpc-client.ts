import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AssessmentQuestionsRouter } from '../trpc.js';

import { buildTrpcUrl } from './trpc-url.js';

export function createAssessmentQuestionsTrpcClient(csrfToken: string) {
  return createTRPCClient<AssessmentQuestionsRouter>({
    links: [
      httpLink({
        url: typeof window === 'undefined' ? '' : buildTrpcUrl(window.location.pathname),
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
