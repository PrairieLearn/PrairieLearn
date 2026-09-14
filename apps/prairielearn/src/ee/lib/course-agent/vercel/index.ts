import path from 'node:path';

import { config } from '../../../../lib/config.js';
import { REPOSITORY_ROOT_PATH } from '../../../../lib/paths.js';

import { createDriver } from './driver.js';
import { Runtime } from './runtime.js';
import { StateStore } from './state.js';

let current: Promise<Runtime> | undefined;

async function createRuntime() {
  const {
    token,
    teamId,
    projectId,
    openaiApiKey,
    githubReadToken,
    model,
    timeoutMs,
    stateDirectory,
  } = config.courseAgentVercel;
  if (!token || !teamId || !projectId || !openaiApiKey || !githubReadToken) {
    throw new Error(
      'Configure courseAgentVercel token, teamId, projectId, openaiApiKey, and githubReadToken in config.json before starting an agent conversation.',
    );
  }
  const runtime = new Runtime(
    new StateStore(path.resolve(REPOSITORY_ROOT_PATH, stateDirectory)),
    createDriver({
      token,
      teamId,
      projectId,
      openaiKey: openaiApiKey,
      githubToken: githubReadToken,
      model,
      timeoutMs,
    }),
    [token, openaiApiKey, githubReadToken],
  );
  await runtime.initialize();
  return runtime;
}

export function getVercelCourseAgentRuntime() {
  if (config.courseAgentRuntime !== 'vercel') {
    throw new Error('The Vercel course-agent runtime is disabled.');
  }
  current ??= createRuntime().catch((error: unknown) => {
    current = undefined;
    throw error;
  });
  return current;
}

export async function closeVercelCourseAgentRuntime() {
  const runtime = await current;
  current = undefined;
  await runtime?.shutdown();
}
