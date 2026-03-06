import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { InstructorQuestionsRouter } from './trpc.js';

export function createInstructorQuestionsTrpcClient() {
  return createTRPCClient<InstructorQuestionsRouter>({
    links: [
      httpLink({
        url: typeof window === 'undefined' ? '' : window.location.pathname + '/trpc',
        headers: { 'X-TRPC': 'true' },
        transformer: superjson,
      }),
    ],
  });
}
