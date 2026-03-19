import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import type { CourseInstanceRouter } from './trpc.js';

export function createCourseInstanceTrpcClient({
  csrfToken,
  courseInstanceId,
  urlBase = '',
}: {
  csrfToken: string;
  courseInstanceId: string;
  urlBase?: string;
}) {
  return createTRPCClient<CourseInstanceRouter>({
    links: [
      httpLink({
        url: `${urlBase}/pl/course_instance/${courseInstanceId}/instructor/trpc`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
