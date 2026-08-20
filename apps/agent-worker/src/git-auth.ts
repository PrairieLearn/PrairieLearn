export function isGitReadRequest(request: Request, repositoryUrl: string): boolean {
  const url = new URL(request.url);
  const repositoryPath = new URL(repositoryUrl).pathname.replace(/\/$/, '');
  return (
    (request.method === 'GET' &&
      url.pathname === `${repositoryPath}/info/refs` &&
      url.searchParams.get('service') === 'git-upload-pack') ||
    (request.method === 'POST' && url.pathname === `${repositoryPath}/git-upload-pack`)
  );
}
