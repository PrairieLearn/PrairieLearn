import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { ManualGradingAssessmentQuestionRouter } from '../trpc.js';

export function createManualGradingTrpcClient(csrfToken: string) {
  return createTRPCClient<ManualGradingAssessmentQuestionRouter>({
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
