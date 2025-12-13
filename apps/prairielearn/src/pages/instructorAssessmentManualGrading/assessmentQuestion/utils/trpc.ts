import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { ManualGradingAssessmentQuestionRouter } from '../trpc.js';

export const client = createTRPCClient<ManualGradingAssessmentQuestionRouter>({
  links: [
    httpLink({
      // TODO: there might be a better way to do this?
      url: typeof window === 'undefined' ? '' : window.location.pathname + '/trpc',
      headers: {
        'X-TRPC': 'true',
      },
      transformer: superjson,
    }),
  ],
});
