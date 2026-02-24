import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { CourseRequestsRouter } from './trpc.js';

export function createCourseRequestsTrpcClient(csrfToken: string, urlPrefix: string) {
  return createTRPCClient<CourseRequestsRouter>({
    links: [
      httpLink({
        url: `${urlPrefix}/administrator/courseRequests/trpc`,
        headers: { 'X-CSRF-Token': csrfToken },
        transformer: superjson,
      }),
    ],
  });
}
