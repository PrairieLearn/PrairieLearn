import { z } from 'zod';

const ParamsSchema = z.object({
  containerId: z.string(),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
});

export interface GitHubEnv {
  COURSE_AGENT_GITHUB_PAT: string;
}

export function courseGithubReadParams(
  namespace: { idFromName: (name: string) => { toString: () => string } },
  sandboxId: string,
  repository: string,
) {
  // Outbound context uses the Durable Object ID, not the application sandbox name.
  return { containerId: namespace.idFromName(sandboxId).toString(), repository };
}

export function githubRepositoryPath(repository: string) {
  const ssh = /^git@github\.com:(.+?)(?:\.git)?$/.exec(repository);
  const sshUrl = /^ssh:\/\/git@github\.com\/(.+?)(?:\.git)?$/.exec(repository);
  const https = /^https:\/\/github\.com\/(.+?)(?:\.git)?\/?$/.exec(repository);
  const path = ssh?.[1] ?? sshUrl?.[1] ?? https?.[1];
  if (!path || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(path)) {
    throw new Error('Course-agent repositories must be hosted on github.com');
  }
  return path;
}

export function githubReadUrl(repository: string) {
  return `https://x-access-token:proxy-read@github.com/${githubRepositoryPath(repository)}.git`;
}

function requestRepository(pathname: string) {
  return /^\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\.git(?:\/|$)/.exec(pathname)?.[1] ?? null;
}

function isUploadPack(request: Request, url: URL) {
  return (
    (request.method === 'GET' &&
      /^\/[^/]+\/[^/]+\.git\/info\/refs$/.test(url.pathname) &&
      url.searchParams.get('service') === 'git-upload-pack') ||
    (request.method === 'POST' && /^\/[^/]+\/[^/]+\.git\/git-upload-pack$/.test(url.pathname))
  );
}

export async function proxyCourseGithubRead(
  request: Request,
  env: GitHubEnv,
  context: { containerId: string; params?: unknown },
  fetchImplementation: typeof fetch = fetch,
) {
  const params = ParamsSchema.parse(context.params);
  const url = new URL(request.url);
  if (
    context.containerId !== params.containerId ||
    requestRepository(url.pathname) !== params.repository ||
    !isUploadPack(request, url)
  ) {
    return new Response('GitHub operation is not permitted.', { status: 403 });
  }
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return new Response('Git authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Course repository"' },
    });
  }
  let credentials = '';
  try {
    credentials = authorization?.startsWith('Basic ')
      ? atob(authorization.slice('Basic '.length))
      : '';
  } catch {
    return new Response('GitHub operation is not permitted.', { status: 403 });
  }
  if (credentials !== 'x-access-token:proxy-read') {
    return new Response('GitHub operation is not permitted.', { status: 403 });
  }
  const headers = new Headers(request.headers);
  headers.set('authorization', `Basic ${btoa(`x-access-token:${env.COURSE_AGENT_GITHUB_PAT}`)}`);
  return fetchImplementation(
    new Request(new URL(`${url.pathname}${url.search}`, 'https://github.com'), {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    }),
  );
}
