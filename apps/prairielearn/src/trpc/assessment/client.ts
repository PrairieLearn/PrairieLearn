import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import { getAssessmentTrpcUrl } from '../../lib/client/url.js';

import type { AssessmentRouter } from './trpc.js';

export function createAssessmentTrpcClient({
  csrfToken,
  courseInstanceId,
  assessmentId,
  urlBase = '',
}: {
  csrfToken: string;
  courseInstanceId: string;
  assessmentId: string;
  urlBase?: string;
}) {
  return createTRPCClient<AssessmentRouter>({
    links: [
      httpLink({
        url: `${urlBase}${getAssessmentTrpcUrl({ courseInstanceId, assessmentId })}`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
