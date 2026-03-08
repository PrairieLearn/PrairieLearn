import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { StudentLabelsRouter } from '../../instructorInstanceAdminTrpc/trpc.js';

export type StudentLabelsTrpcClient = ReturnType<typeof createStudentLabelsTrpcClient>;

export function createStudentLabelsTrpcClient(csrfToken: string, trpcUrl: string) {
  return createTRPCClient<StudentLabelsRouter>({
    links: [
      httpLink({
        url: trpcUrl,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
