import { Octokit } from '@octokit/rest';

import { config } from './config.js';

/**
 * Creates an octokit client from the client token specified in the config.
 */
export function getGithubClient(): Octokit | null {
  if (config.githubClientToken === null) {
    return null;
  }
  return new Octokit({ auth: config.githubClientToken });
}
