import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const localCapabilitySecret = 'local-agent-capability-secret-32-bytes';

export async function writeLocalAgentConfig() {
  const localCourseConfig = {};
  for (const configPath of [
    path.join(os.homedir(), '.config', 'prairielearn', 'config.json'),
    path.join(repositoryRoot, 'config.json'),
    path.join(repositoryRoot, 'apps', 'prairielearn', 'config.json'),
  ]) {
    try {
      const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
      if (!isRecord(parsed)) continue;

      // Course paths are the only values inherited from a developer's normal
      // config. In particular, never copy database, Redis, S3, or auth settings
      // into the agent stack: it enables arbitrary SQL in development.
      if (isStringArray(parsed.courseDirs)) {
        localCourseConfig.courseDirs = parsed.courseDirs;
      }
      if (typeof parsed.coursesRoot === 'string') {
        localCourseConfig.coursesRoot = parsed.coursesRoot;
      }
      if (typeof parsed.exampleCoursePath === 'string') {
        localCourseConfig.exampleCoursePath = parsed.exampleCoursePath;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const serverPort = process.env.AGENT_PRAIRIELEARN_PORT ?? process.env.CONDUCTOR_PORT ?? '3000';
  const workerPort = process.env.AGENT_WORKER_PORT ?? '8787';
  const config = {
    ...localCourseConfig,
    devMode: true,
    postgresqlHost: 'localhost',
    postgresqlSsl: false,
    redisUrl: process.env.CONDUCTOR_PORT ? undefined : 'redis://localhost:6379/',
    nonVolatileRedisUrl: process.env.CONDUCTOR_PORT ? undefined : 'redis://localhost:6379/',
    serverPort,
    serverCanonicalHost: `http://localhost:${serverPort}`,
    agentWorkerUrl: `http://localhost:${workerPort}`,
    agentCapabilitySecret: localCapabilitySecret,
    agentHarness: 'deterministic',
    features: {
      'cloud-agent': true,
      'cloud-agent-arbitrary-sql': true,
    },
  };
  const stateDirectory = path.join(repositoryRoot, '.wrangler', 'agent-local');
  const configPath = path.join(stateDirectory, 'prairielearn-config.json');
  await fs.mkdir(stateDirectory, { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return { configPath, serverPort, stateDirectory, workerPort };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
