import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { InstructorRequestCourseRouter } from './trpc.js';

export function createInstructorRequestCourseTrpcClient(csrfToken: string, urlPrefix: string) {
  return createTRPCClient<InstructorRequestCourseRouter>({
    links: [
      httpLink({
        url: `${urlPrefix}/request_course/trpc`,
        headers: { 'X-CSRF-Token': csrfToken },
        transformer: superjson,
      }),
    ],
  });
}
