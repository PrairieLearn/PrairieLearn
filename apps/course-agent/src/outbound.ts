// This executes in Workers, never inside the Linux container.
/** Inject the model credential outside the sandbox, only for the allowlisted inference endpoint. */
export async function forwardOpenAI(
  request: Request,
  env: { CODEX_API_KEY: unknown },
  send: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.origin !== 'http://openai.internal' ||
    request.method !== 'POST' ||
    !['/v1/responses', '/v1/responses/compact'].includes(url.pathname)
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  if (typeof env.CODEX_API_KEY !== 'string' || !env.CODEX_API_KEY) {
    return new Response('Model credentials unavailable', { status: 503 });
  }
  const upstream = new Request(
    `https://api.openai.com${url.pathname}`,
    new Request(request, { redirect: 'manual' }),
  );
  upstream.headers.set('Authorization', `Bearer ${env.CODEX_API_KEY}`);
  // Do not let sandbox code select an unrelated billing project/organization.
  upstream.headers.delete('OpenAI-Organization');
  upstream.headers.delete('OpenAI-Project');
  try {
    const response = await send(upstream);
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return new Response('Model redirect blocked', { status: 502 });
    }
    return response;
  } catch {
    return new Response('Model request failed', { status: 502 });
  }
}

/** Allow repository reads with injected credentials; pushes require the trusted PL webserver approval path. */
export async function forwardGitHub(
  request: Request,
  env: { GITHUB_CLIENT_TOKEN?: string; repository: string },
  send: typeof fetch = fetch,
): Promise<Response> {
  const repo = env.repository;
  const url = new URL(request.url);
  if (
    !repo ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    !['https://github.com', 'http://github.com'].includes(url.origin)
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  const discovery =
    request.method === 'GET' &&
    url.pathname === `/${repo}.git/info/refs` &&
    url.search === '?service=git-upload-pack';
  const upload =
    request.method === 'POST' && url.pathname === `/${repo}.git/git-upload-pack` && !url.search;
  if (!discovery && !upload) {
    return new Response('Only read-only Git access is allowed', {
      status: 403,
    });
  }
  if (!env.GITHUB_CLIENT_TOKEN) return new Response('Git credentials unavailable', { status: 503 });
  const headers = new Headers();
  headers.set('Authorization', `Basic ${btoa(`x-access-token:${env.GITHUB_CLIENT_TOKEN}`)}`);
  for (const name of ['content-type', 'accept', 'git-protocol', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const result = await send(
      new Request(`https://github.com${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      }),
    );
    if (result.status >= 300 && result.status < 400) {
      await result.body?.cancel();
      return new Response('Git redirect blocked', { status: 502 });
    }
    return result;
  } catch {
    return new Response('Git request failed', { status: 502 });
  }
}
