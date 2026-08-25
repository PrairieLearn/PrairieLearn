import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';

import { config, loadConfig } from '../lib/config.js';
import { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } from '../lib/paths.js';

function configPaths() {
  if (process.env.PL_CONFIG_PATH) {
    if (!fs.existsSync(process.env.PL_CONFIG_PATH)) {
      throw new Error(`PL_CONFIG_PATH does not exist: ${process.env.PL_CONFIG_PATH}`);
    }
    return [process.env.PL_CONFIG_PATH];
  }
  return [
    path.join(os.homedir(), '.config', 'prairielearn', 'config.json'),
    path.join(REPOSITORY_ROOT_PATH, 'config.json'),
    path.join(APP_ROOT_PATH, 'config.json'),
  ];
}

await loadConfig(configPaths());

const required = {
  ANTHROPIC_API_KEY: config.courseAgentAnthropicApiKey,
  GITHUB_TOKEN: config.courseAgentGithubToken,
  COURSE_AGENT_CAPABILITY_SECRET: config.courseAgentCapabilitySecret,
};
const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  throw new Error(
    `Missing PrairieLearn course-agent config values for Worker secrets: ${missing.join(', ')}`,
  );
}

console.warn('Starting Wrangler with course-agent credentials loaded through PrairieLearn config.');
console.warn('No .dev.vars file is read or written. Secret values will not be printed.');
console.warn(`Worker: ${config.courseAgentWorkerOrigin}`);
console.warn(`Idle timeout: ${config.courseAgentIdleTimeoutSeconds}s`);
console.warn(`Workspace backup TTL: ${config.courseAgentWorkspaceBackupTtlSeconds}s`);

await execa(
  'corepack',
  [
    'pnpm',
    '--filter',
    '@prairielearn/course-agent-worker',
    'exec',
    'wrangler',
    'dev',
    '--persist-to',
    '.wrangler/state',
    '--var',
    `COURSE_AGENT_IDLE_TIMEOUT_SECONDS:${config.courseAgentIdleTimeoutSeconds}`,
    '--var',
    `COURSE_AGENT_BACKUP_TTL_SECONDS:${config.courseAgentWorkspaceBackupTtlSeconds}`,
    '--var',
    'ANTHROPIC_MODEL:sonnet',
    '--var',
    'BACKUP_BUCKET_NAME:prairielearn-course-agent-artifacts',
  ],
  {
    cwd: REPOSITORY_ROOT_PATH,
    env: {
      ANTHROPIC_API_KEY: required.ANTHROPIC_API_KEY!,
      GITHUB_TOKEN: required.GITHUB_TOKEN!,
      COURSE_AGENT_CAPABILITY_SECRET: required.COURSE_AGENT_CAPABILITY_SECRET!,
    },
    stdio: 'inherit',
  },
);
