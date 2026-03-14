import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { CourseInstanceRouter } from './trpc.js';

export function createCourseInstanceTrpcClient({
  csrfToken,
  courseInstanceId,
}: {
  csrfToken: string;
  courseInstanceId: string;
}) {
  return createTRPCClient<CourseInstanceRouter>({
    links: [
      httpLink({
        url: `/pl/course_instance/${courseInstanceId}/instructor/trpc`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
