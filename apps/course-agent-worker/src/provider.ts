export interface ProviderEnv {
  ANTHROPIC_API_KEY: string;
}

export async function proxyAnthropicRequest(
  request: Request,
  env: ProviderEnv,
  fetchImplementation: typeof fetch = fetch,
) {
  const source = new URL(request.url);
  if (
    request.method !== 'POST' ||
    !source.pathname.startsWith('/v1/messages') ||
    request.headers.get('x-api-key') !== 'proxy-injected'
  ) {
    return new Response('Model-provider request is not permitted.', { status: 403 });
  }

  const headers = new Headers(request.headers);
  headers.set('x-api-key', env.ANTHROPIC_API_KEY);
  const body = await request.arrayBuffer();
  return fetchImplementation(
    new Request(new URL(`${source.pathname}${source.search}`, 'https://api.anthropic.com'), {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
    }),
  );
}
