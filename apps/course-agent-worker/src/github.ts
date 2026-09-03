import { z } from 'zod';

const ParamsSchema = z.object({
  containerId: z.string(),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
});

export interface GitHubEnv {
  COURSE_AGENT_GITHUB_PAT: string;
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
    (request.method === 'GET' && url.searchParams.get('service') === 'git-upload-pack') ||
    (request.method === 'POST' && url.pathname.endsWith('/git-upload-pack'))
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
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return new Response('GitHub authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="GitHub"' },
    });
  }
  let credentials = '';
  try {
    credentials = authorization.startsWith('Basic ')
      ? atob(authorization.slice('Basic '.length))
      : '';
  } catch {
    return new Response('GitHub operation is not permitted.', { status: 403 });
  }
  const containerMatches = context.containerId === params.containerId;
  const repositoryMatches = requestRepository(url.pathname) === params.repository;
  const credentialsMatch = credentials === 'x-access-token:proxy-read';
  const uploadPack = isUploadPack(request, url);
  if (!containerMatches || !repositoryMatches || !credentialsMatch || !uploadPack) {
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
