import { z } from 'zod';

export const COURSE_DATA_VIRTUAL_HOST = 'course-data.internal';

const CourseDataOutboundParamsSchema = z.object({
  capability: z.string(),
  callbackOrigin: z.url(),
});

export async function proxyCourseDataRequest(
  request: Request,
  rawParams: unknown,
  fetchImplementation: typeof fetch = fetch,
) {
  const params = CourseDataOutboundParamsSchema.parse(rawParams);
  const sourceUrl = new URL(request.url);
  if (
    !['GET', 'POST'].includes(request.method) ||
    !/^\/((resources)(\/[^/]+)?|query)$/.test(sourceUrl.pathname)
  ) {
    return new Response('Unsupported course-data operation', { status: 405 });
  }

  const destination = new URL(
    `/pl/webhooks/course-agent/data${sourceUrl.pathname}${sourceUrl.search}`,
    params.callbackOrigin,
  );
  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${params.capability}`,
  });
  if (request.method === 'POST') headers.set('Content-Type', 'application/json');
  return fetchImplementation(destination, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? request.body : undefined,
    redirect: 'manual',
  });
}
