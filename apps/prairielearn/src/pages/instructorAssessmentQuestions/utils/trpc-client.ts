import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { AssessmentQuestionsRouter } from '../trpc.js';

export function createAssessmentQuestionsTrpcClient(csrfToken: string) {
  return createTRPCClient<AssessmentQuestionsRouter>({
    links: [
      httpLink({
        // TODO: This URL construction must match the server-side CSRF token URL.
        // Consider a shared `buildTrpcUrl` helper to keep them in sync.
        url: typeof window === 'undefined' ? '' : window.location.pathname.replace(/\/$/, '') + '/trpc',
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
