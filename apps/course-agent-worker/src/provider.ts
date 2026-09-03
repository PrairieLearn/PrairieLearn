export interface ProviderEnv {
  OPENAI_API_KEY?: string;
}

export async function proxyOpenAiRequest(
  request: Request,
  env: ProviderEnv,
  fetchImplementation: typeof fetch = fetch,
) {
  const source = new URL(request.url);
  if (
    !['GET', 'POST'].includes(request.method) ||
    !['/v1/models', '/v1/responses', '/v1/responses/compact'].some(
      (path) => source.pathname === path || source.pathname.startsWith(`${path}/`),
    ) ||
    request.headers.get('authorization') !== 'Bearer proxy-injected'
  ) {
    return new Response('Model-provider request is not permitted.', { status: 403 });
  }

  if (!env.OPENAI_API_KEY) {
    return new Response('Model-provider credential is not configured.', { status: 503 });
  }

  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${env.OPENAI_API_KEY}`);
  const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
  return fetchImplementation(
    new Request(new URL(`${source.pathname}${source.search}`, 'https://api.openai.com'), {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    }),
  );
}
