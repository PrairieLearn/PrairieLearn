import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import { getCourseInstanceTrpcUrl } from '../../lib/client/url.js';

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
        url: `${urlBase}${getCourseInstanceTrpcUrl(courseInstanceId)}`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}
