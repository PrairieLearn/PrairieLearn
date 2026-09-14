import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { HarnessAgent, type HarnessAgentResumeSessionState } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { tool } from 'ai';
import { z } from 'zod';

import {
  type CourseAgentPushPayload,
  CourseAgentPushPayloadSchema,
} from '@prairielearn/course-agent-protocol';

import { readOnlyPolicy, repositoryPath } from './policy.ts';
import type { State } from './state.ts';

export type Part =
  | { type: 'text'; text: string }
  | { type: 'tool-start' | 'tool-end'; id: string; label: string; failed?: boolean }
  | { type: 'publish'; id: string };

export interface DriverSession {
  stream(
    input: { prompt: string } | { toolCallId: string; output: Record<string, unknown> },
  ): AsyncIterable<Part>;
  proposal(): Promise<CourseAgentPushPayload>;
  refresh(): Promise<void>;
  checkpoint(): Promise<{ resume: HarnessAgentResumeSessionState; snapshotId: string }>;
  interrupt(): Promise<void>;
}

export type DriverFactory = (state: State) => Promise<DriverSession>;

export interface RuntimeConfig {
  token: string;
  teamId: string;
  projectId: string;
  openaiKey: string;
  githubToken: string;
  model: string;
  timeoutMs: number;
}

const WORKSPACE = '/vercel/sandbox/course';
const REFERENCE_ROOT = '/vercel/sandbox/course-authoring';
const referenceDirectory = fileURLToPath(
  new URL('../../course-agent-worker/skills/course-content-authoring/', import.meta.url),
);

async function referenceFiles(
  directory: string,
  prefix = '',
): Promise<{ path: string; content: Buffer }[]> {
  const files: { path: string; content: Buffer }[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await referenceFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push({
        path: `${REFERENCE_ROOT}/${relative}`,
        content: await readFile(path.join(directory, entry.name)),
      });
    }
  }
  return files;
}

export function createDriver(config: RuntimeConfig): DriverFactory {
  return async (state) => {
    const policy = readOnlyPolicy(state.request.course.repository, config.githubToken);
    const lookup = {
      name: state.request.sandboxId,
      token: config.token,
      teamId: config.teamId,
      projectId: config.projectId,
      resume: false,
    };
    if (state.resume) {
      const saved = await Sandbox.get(lookup);
      if (
        !saved.currentSnapshotId ||
        saved.currentSnapshotId !== state.snapshot.workspaceBackup?.handle.id
      ) {
        throw new Error(
          'The saved workspace snapshot is unavailable or changed. Start a new conversation.',
        );
      }
    }
    const sandbox = await Sandbox.getOrCreate({
      name: state.request.sandboxId,
      token: config.token,
      teamId: config.teamId,
      projectId: config.projectId,
      runtime: 'node24',
      ports: [4000],
      persistent: true,
      resume: true,
      timeout: config.timeoutMs,
      snapshotExpiration: state.request.runtimeSettings.backupTtlSeconds * 1000,
      keepLastSnapshots: { count: 2 },
      networkPolicy: policy,
    });
    // Replace policies from an earlier VM before the harness adds model credentials.
    await sandbox.update({ networkPolicy: policy }).catch(async (error: unknown) => {
      await sandbox.stop().catch(() => {});
      throw error;
    });

    async function git(...args: string[]) {
      const result = await sandbox.runCommand({ cmd: 'git', args, cwd: WORKSPACE });
      if (result.exitCode !== 0) {
        throw new Error(`Git operation failed: ${(await result.stderr()).slice(0, 8000)}`);
      }
      return (await result.stdout()).trim();
    }

    const agent = new HarnessAgent({
      id: 'prairielearn-course-agent',
      harness: createCodex({
        auth: { OPENAI_API_KEY: config.openaiKey, OPENAI_BASE_URL: 'https://api.openai.com/v1' },
      }),
      model: config.model,
      sandbox: createVercelSandbox({ sandbox }),
      sandboxConfig: {
        workDir: 'course',
        onSession: async () => {
          const exists = await sandbox.runCommand({
            cmd: 'test',
            args: ['-d', `${WORKSPACE}/.git`],
          });
          if (exists.exitCode !== 0) {
            const repo = repositoryPath(state.request.course.repository);
            const clone = await sandbox.runCommand({
              cmd: 'git',
              args: [
                'clone',
                '--depth',
                '1',
                '--single-branch',
                '--branch',
                state.request.course.branch,
                '--',
                `https://x-access-token:course-agent-read@github.com/${repo}.git`,
                WORKSPACE,
              ],
            });
            if (clone.exitCode !== 0) {
              throw new Error(`Course clone failed: ${(await clone.stderr()).slice(0, 4000)}`);
            }
            if (
              state.request.course.expectedSha &&
              (await git('rev-parse', 'HEAD')) !== state.request.course.expectedSha
            ) {
              throw new Error(
                'The remote course changed. Sync the course in PrairieLearn before starting this conversation.',
              );
            }
            await git('config', 'user.name', 'PrairieLearn Agent');
            await git('config', 'user.email', 'agent@prairielearn.com');
            await git('config', 'core.hooksPath', '/dev/null');
          }
          await sandbox.writeFiles(await referenceFiles(referenceDirectory));
        },
      },
      instructions: `You help an authorized instructor edit this PrairieLearn course. Work in ${WORKSPACE}. Read ${REFERENCE_ROOT}/SKILL.md before authoring content; its references and examples are available locally. Current course instance: ${JSON.stringify(state.request.authoringContext.courseInstance)}. Commit intended changes locally, then call the argument-free push_sync tool. The tool asks the instructor to review the exact proposed files, publishes through PrairieLearn, and returns the sync outcome. Never push directly. Never claim a change was published before the tool reports success. A denied proposal must not be resubmitted unchanged. Do not change release/access rules unless requested.`,
      tools: {
        push_sync: tool({
          description:
            'Validate committed course changes and request instructor approval to publish and sync. Wait for the result before proceeding.',
          inputSchema: z.strictObject({}),
        }),
      },
    });
    const session = await agent
      .createSession({
        sessionId: state.request.conversationId,
        ...(state.resume ? { resumeFrom: state.resume } : {}),
      })
      .catch(async (error: unknown) => {
        await sandbox.stop().catch(() => {});
        throw error;
      });
    const controller = new AbortController();

    return {
      async *stream(input) {
        const result =
          'prompt' in input
            ? await agent.stream({ session, prompt: input.prompt, abortSignal: controller.signal })
            : await agent.continueStream({
                session,
                toolResultContinuations: [
                  {
                    type: 'tool-result',
                    toolName: 'push_sync',
                    toolCallId: input.toolCallId,
                    output: { type: 'text', value: JSON.stringify(input.output) },
                  },
                ],
                abortSignal: controller.signal,
              });
        for await (const part of result.stream) {
          if (part.type === 'text-delta') {
            yield { type: 'text', text: part.text };
          } else if (part.type === 'tool-call') {
            if (part.toolName === 'push_sync') yield { type: 'publish', id: part.toolCallId };
            else yield { type: 'tool-start', id: part.toolCallId, label: part.toolName };
          } else if (part.type === 'tool-result') {
            yield { type: 'tool-end', id: part.toolCallId, label: part.toolName };
          } else if (part.type === 'tool-error') {
            yield { type: 'tool-end', id: part.toolCallId, label: part.toolName, failed: true };
          } else if (part.type === 'error') {
            throw part.error;
          }
        }
      },
      async proposal() {
        if (await git('status', '--porcelain')) {
          throw new Error('Commit all intended changes before calling push_sync.');
        }
        await git('fetch', 'origin', state.request.course.branch);
        const baseSha = await git('rev-parse', 'FETCH_HEAD');
        const proposedSha = await git('rev-parse', 'HEAD');
        await git('merge-base', '--is-ancestor', baseSha, proposedSha);
        const diff = await git(
          'diff',
          '--binary',
          '--no-ext-diff',
          '--no-textconv',
          `${baseSha}..${proposedSha}`,
        );
        if (!diff) throw new Error('There are no committed changes to publish.');
        return CourseAgentPushPayloadSchema.parse({
          baseSha,
          proposedSha,
          branch: state.request.course.branch,
          treeSha: await git('rev-parse', 'HEAD^{tree}'),
          commitMessage: await git('log', '-1', '--format=%B'),
          diffSummary: await git('diff', '--stat', `${baseSha}..${proposedSha}`),
          diff: `${diff}\n`,
        });
      },
      async refresh() {
        await git('fetch', 'origin', state.request.course.branch);
        await git('merge', '--no-edit', 'FETCH_HEAD');
      },
      async checkpoint() {
        const resume = await session.detach();
        // A caller-owned native sandbox must be stopped explicitly.
        const stopped = await sandbox.stop();
        if (stopped.snapshot?.id) return { resume, snapshotId: stopped.snapshot.id };
        for (let attempt = 0; attempt < 60; attempt++) {
          const saved = await Sandbox.get(lookup);
          if (
            saved.currentSnapshotId &&
            saved.currentSnapshotId !== state.snapshot.workspaceBackup?.handle.id
          ) {
            return { resume, snapshotId: saved.currentSnapshotId };
          }
          await setTimeout(500);
        }
        throw new Error('Vercel did not confirm a new workspace snapshot.');
      },
      async interrupt() {
        controller.abort();
        try {
          await session.stop();
        } finally {
          await sandbox.stop();
        }
      },
    };
  };
}
