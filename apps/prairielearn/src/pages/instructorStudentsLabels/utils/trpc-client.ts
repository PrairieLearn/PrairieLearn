import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { StudentLabelsRouter } from '../trpc.js';

export type StudentLabelsTrpcClient = ReturnType<typeof createStudentLabelsTrpcClient>;

export function createStudentLabelsTrpcClient(csrfToken: string) {
  return createTRPCClient<StudentLabelsRouter>({
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
