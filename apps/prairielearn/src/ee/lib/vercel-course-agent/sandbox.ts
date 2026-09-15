import { HarnessAgent, HarnessError } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';

import { config } from '../../../lib/config.js';

import type { courseRepository } from './course-repository.js';
import { withGitAuth } from './git-auth.js';

export const sandboxLifetimeMs = 30 * 60_000;

export async function createSandboxAgent(repository: ReturnType<typeof courseRepository>) {
  const credentials = config.vercelCourseAgent;
  if (!credentials) {
    throw new HarnessError({
      message: 'Vercel course agent is not configured. Ask an administrator to configure it.',
    });
  }
  const { token, teamId, projectId, openAiApiKey, githubPat, model } = credentials;
  const sandbox = await Sandbox.create({
    token,
    teamId,
    projectId,
    runtime: 'node24',
    ports: [4000],
    persistent: false,
    timeout: sandboxLifetimeMs,
  });
  try {
    const provider = withGitAuth(createVercelSandbox({ sandbox }), repository.url, githubPat);
    // Install read credentials before clone; later Codex attachment also adds OpenAI auth.
    const session = await provider.createSession();
    await session.addRequestTransformations!([]);
    const clone = await sandbox.runCommand({
      cmd: 'git',
      args: [
        'clone',
        '--depth',
        '1',
        '--single-branch',
        '--branch',
        repository.branch,
        '--config',
        'user.name=PrairieLearn course agent',
        '--config',
        'user.email=course-agent@prairielearn.org',
        '--',
        repository.url,
        'course',
      ],
    });
    if (clone.exitCode !== 0) {
      throw new HarnessError({
        message:
          'Course checkout failed. Check GitHub PAT read access and the course repository and branch settings.',
      });
    }
    const agent = new HarnessAgent({
      harness: createCodex({ auth: { OPENAI_API_KEY: openAiApiKey }, webSearch: true }),
      model,
      sandbox: provider,
      sandboxConfig: { workDir: 'course' },
      instructions:
        'Help build PrairieLearn course content in this checkout. Follow existing course conventions. Use your native file and shell tools. Keep replies brief. Changes are not published to PrairieLearn.',
    });
    return { agent, sandbox };
  } catch (error) {
    await sandbox.stop().catch(() => {});
    throw error;
  }
}
