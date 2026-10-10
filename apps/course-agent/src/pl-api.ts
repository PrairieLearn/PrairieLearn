import { ChatError, type ServiceScope, serviceHeaders } from '@prairielearn/course-agent-contract';

export async function callPL(
  env: { PL_API_ORIGIN?: string; PL_SERVICE_TOKEN?: string },
  scope: ServiceScope,
  path: string,
  body: unknown,
) {
  if (!env.PL_API_ORIGIN || !env.PL_SERVICE_TOKEN) {
    throw new ChatError(503, 'PrairieLearn API is not configured.');
  }
  const url = new URL(`/pl/api/course-automation/v1${path}`, env.PL_API_ORIGIN);
  const json = JSON.stringify(body);
  const response = await fetch(url, {
    method: 'POST',
    headers: await serviceHeaders(env.PL_SERVICE_TOKEN, 'pl-api', 'POST', url.pathname, scope, {
      body: json,
    }),
    body: json,
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new ChatError(502, 'PrairieLearn API redirected unexpectedly.');
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string;
      code?: string;
    } | null;
    throw new ChatError(
      response.status,
      error?.message ?? 'PrairieLearn API request failed.',
      error?.code,
    );
  }
  return response.json();
}
