const GITHUB_REPOSITORY_REGEX =
  /^(?:git@github\.com:\/?|https?:\/\/github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

export const GITHUB_USERNAME_MAX_LENGTH = 39;
export const GITHUB_USERNAME_PATTERN = '[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}';
export const GITHUB_USERNAME_VALIDATION_MESSAGE = 'Enter a valid GitHub username.';

const GITHUB_USERNAME_REGEX = new RegExp(`^${GITHUB_USERNAME_PATTERN}$`);

/** Parses a stored course `repository` string into its GitHub owner and repo, or null if it is not a recognized GitHub URL. */
export function parseGithubRepository(repository: string): { owner: string; repo: string } | null {
  const match = GITHUB_REPOSITORY_REGEX.exec(repository.trim());
  if (match === null) return null;
  return { owner: match[1], repo: match[2] };
}

export function isValidGithubUsername(username: string): boolean {
  return GITHUB_USERNAME_REGEX.test(username);
}
