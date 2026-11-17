import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';

import { getCourseTrpcUrl } from '../../lib/client/url.js';

import type { CourseRouter } from './trpc.js';

export function createCourseTrpcClient({
  csrfToken,
  courseId,
  courseInstanceId,
  urlBase = '',
  extraHeaders,
}: {
  csrfToken: string;
  courseId: string;
  courseInstanceId?: string;
  urlBase?: string;
  extraHeaders?: Record<string, string>;
}) {
  return createTRPCClient<CourseRouter>({
    links: [
      httpLink({
        url: `${urlBase}${getCourseTrpcUrl(courseId, courseInstanceId)}`,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': csrfToken,
          ...extraHeaders,
        },
        transformer: superjson,
      }),
    ],
  });
}
