const GITHUB_REPOSITORY_REGEX =
  /^(?:git@github\.com:\/?|https?:\/\/github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

/** Parses a stored course `repository` string into its GitHub owner and repo, or null if it is not a recognized GitHub URL. */
export function parseGithubRepository(repository: string): { owner: string; repo: string } | null {
  const match = GITHUB_REPOSITORY_REGEX.exec(repository.trim());
  if (match === null) return null;
  return { owner: match[1], repo: match[2] };
}
