import { openAsBlob } from 'node:fs';
import { cp, mkdir, realpath } from 'node:fs/promises';
import * as path from 'node:path';

import { execa } from 'execa';
import * as tar from 'tar';
import { dir as temporaryDirectory } from 'tmp-promise';
import { z } from 'zod';

import * as error from '@prairielearn/error';

import { config } from '../../../lib/config.js';

export function buildCourseAgentServiceRequest(path: string) {
  const { courseAgentServiceUrl, courseAgentServiceToken } = config;
  if (!courseAgentServiceUrl || !courseAgentServiceToken) {
    throw new error.HttpStatusError(503, 'The course agent service is not configured');
  }
  return {
    url: new URL(
      path,
      courseAgentServiceUrl.endsWith('/') ? courseAgentServiceUrl : `${courseAgentServiceUrl}/`,
    ),
    headers: { Authorization: `Bearer ${courseAgentServiceToken}` },
  };
}

const CreatedConversationSchema = z.object({ id: z.uuid() });

/** Creates a conversation in Cloudflare and returns its service-generated ID; no agent turn runs yet. */
export async function createCourseAgentConversation(binding: {
  repository: string;
  branch: string;
}): Promise<string> {
  return createConversation('conversations', JSON.stringify(binding), 'application/json');
}

/** Snapshot current course files and their Git history without exposing host paths. */
export async function createLocalCourseAgentConversation(coursePath: string): Promise<string> {
  const temporary = await temporaryDirectory({ unsafeCleanup: true });
  try {
    const sourcePath = await realpath(coursePath);
    const repository = path.join(temporary.path, 'repository');
    const archive = path.join(temporary.path, 'source.tar.gz');
    await mkdir(repository);
    const history = await execa(
      'git',
      ['rev-parse', '--show-prefix', '--symbolic-full-name', '--verify', 'HEAD'],
      { cwd: sourcePath, reject: false },
    );
    let directory = '.';
    if (history.exitCode === 0) {
      const [prefix, ref] = history.stdout.split('\n');
      directory = prefix || '.';
      await execa('git', ['init', '--initial-branch=local'], { cwd: repository });
      // Keep the directory prefix so Git can filter the history without a second rewrite.
      await execa('git', ['fast-export', `--refspec=${ref}:refs/heads/local`, 'HEAD', '--', '.'], {
        cwd: sourcePath,
        buffer: false,
      }).pipe('git', ['fast-import', '--quiet'], { cwd: repository });
      await execa('git', ['reset', '--mixed'], { cwd: repository });
    }
    await cp(sourcePath, path.join(repository, directory), {
      recursive: true,
      verbatimSymlinks: true,
      filter: (entry) =>
        !path
          .relative(sourcePath, entry)
          .split(path.sep)
          .some((part) => ['.git', 'node_modules', '.venv', '__pycache__'].includes(part)),
    });
    await tar.create(
      {
        file: archive,
        cwd: repository,
        gzip: true,
      },
      ['.'],
    );
    // A file-backed Blob streams the upload with a known Content-Length for R2.
    const body = await openAsBlob(archive);
    return await createConversation('conversations/local', body, 'application/gzip', {
      'X-PL-Course-Directory': encodeURIComponent(directory),
    });
  } finally {
    await temporary.cleanup();
  }
}

async function createConversation(
  path: string,
  body: BodyInit,
  contentType: string,
  extraHeaders: Record<string, string> = {},
) {
  const { url, headers } = buildCourseAgentServiceRequest(path);
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, ...extraHeaders, 'Content-Type': contentType },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new error.HttpStatusError(502, 'Could not create the course agent conversation');
  }
  return CreatedConversationSchema.parse(await response.json()).id;
}

/** Wait for workspace recovery; lifecycle updates keep connected browsers informed. */
export async function resumeCourseAgentConversation(agentConversationId: string) {
  const { url, headers } = buildCourseAgentServiceRequest(
    `conversations/${encodeURIComponent(agentConversationId)}/resume`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers,
  });
  if (!response.ok) {
    throw new error.HttpStatusError(
      response.status === 409 ? 409 : 503,
      response.status === 409
        ? 'Conversation is not blocked or is already recovering.'
        : 'Could not recover the workspace.',
    );
  }
  return z.strictObject({ recovered: z.literal(true) }).parse(await response.json());
}
