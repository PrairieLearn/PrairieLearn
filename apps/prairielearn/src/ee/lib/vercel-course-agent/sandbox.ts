import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';

import { config } from '../../../lib/config.js';

export const sandboxLifetimeMs = 30 * 60_000;

export async function createSandboxAgent() {
  const credentials = config.vercelCourseAgent;
  if (!credentials) throw new Error('Vercel course agent is not configured.');
  const { token, teamId, projectId, openAiApiKey, model } = credentials;
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
    await sandbox.writeFiles([
      {
        path: '/vercel/sandbox/workspace/README.md',
        content: Buffer.from(
          '# Course agent workspace\n\nThis is a temporary workspace for experimenting with a PrairieLearn coding agent.\n',
        ),
      },
    ]);
    const agent = new HarnessAgent({
      harness: createCodex({ auth: { OPENAI_API_KEY: openAiApiKey }, webSearch: true }),
      model,
      sandbox: createVercelSandbox({ sandbox }),
      sandboxConfig: { workDir: 'workspace' },
      instructions:
        'Help build PrairieLearn course content in this temporary workspace. Use your native file and shell tools. Keep replies brief. Changes are not published to PrairieLearn.',
    });
    return { agent, sandbox };
  } catch (error) {
    await sandbox.stop().catch(() => {});
    throw error;
  }
}
