import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import { getInstanceQuestionTrpcUrl } from '../../lib/client/url.js';

import type { InstanceQuestionRouter } from './trpc.js';

export function createInstanceQuestionTrpcClient({
  csrfToken,
  courseInstanceId,
  instanceQuestionId,
  urlBase = '',
}: {
  csrfToken: string;
  courseInstanceId: string;
  instanceQuestionId: string;
  urlBase?: string;
}) {
  return createTRPCClient<InstanceQuestionRouter>({
    links: [
      httpLink({
        url: `${urlBase}${getInstanceQuestionTrpcUrl({ courseInstanceId, instanceQuestionId })}`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
