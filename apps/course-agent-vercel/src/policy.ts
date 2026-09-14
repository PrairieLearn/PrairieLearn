import type { NetworkPolicy } from '@vercel/sandbox';

export function repositoryPath(repository: string) {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      repository,
    );
  if (!match || match[1].split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('The prototype supports repositories hosted on github.com.');
  }
  return match[1];
}

export function readOnlyPolicy(repository: string, githubToken: string): NetworkPolicy {
  const repo = repositoryPath(repository);
  const authorization = `Basic ${Buffer.from(`x-access-token:${githubToken}`).toString('base64')}`;
  const placeholder = `Basic ${Buffer.from('x-access-token:course-agent-read').toString('base64')}`;
  const headers = [{ key: { exact: 'authorization' }, value: { exact: placeholder } }];
  return {
    allow: {
      'api.openai.com': [],
      'registry.npmjs.org': [],
      'github.com': [
        {
          match: {
            method: ['GET'],
            path: { exact: `/${repo}.git/info/refs` },
            queryString: [{ key: { exact: 'service' }, value: { exact: 'git-upload-pack' } }],
            headers,
          },
          transform: [{ headers: { Authorization: authorization, Host: 'github.com' } }],
        },
        {
          match: {
            method: ['POST'],
            path: { exact: `/${repo}.git/git-upload-pack` },
            headers,
          },
          transform: [{ headers: { Authorization: authorization, Host: 'github.com' } }],
        },
      ],
    },
  };
}
