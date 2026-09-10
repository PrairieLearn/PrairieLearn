import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildCourseManifest, formatCourseContext } from './course-context.mjs';
import { requestPushApproval } from './push-approval.mjs';

const THREAD_CONFIGURATION_VERSION = 3;
const pushTool = {
  name: 'push_sync',
  description:
    'Validate committed course changes and request instructor approval to push and sync. Fix errors before resubmitting; denial is not approval.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

// App-server, unlike exec --json, exposes incremental agent-message text.
export async function runCodex({
  model,
  prompt,
  emit,
  command = 'codex',
  baseUrl = 'https://api.openai.com/v1',
  cwd = process.cwd(),
  codexHome = join(cwd, '.course-agent', 'codex'),
  history = [],
  authoringContext = { courseInstance: null },
  request = prompt,
  continuation,
  requestApproval = requestPushApproval,
}) {
  const skillPath = fileURLToPath(
    new URL('../skills/course-content-authoring/SKILL.md', import.meta.url),
  );
  const skill = await readFile(skillPath, 'utf8');
  const assessmentExample = await readFile(
    new URL(
      '../skills/course-content-authoring/assets/assessments/dynamicProgrammingHomework/infoAssessment.json',
      import.meta.url,
    ),
    'utf8',
  );
  const courseContext = formatCourseContext(
    await buildCourseManifest({ courseRoot: cwd, authoringContext, request }),
  );
  const contextualPrompt = `${prompt}\n\n${courseContext}`;
  await mkdir(codexHome, { recursive: true });
  const threadFile = join(codexHome, 'course-agent-thread.json');
  let savedThread;
  try {
    savedThread = JSON.parse(await readFile(threadFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (savedThread && typeof savedThread.threadId !== 'string') {
    throw new Error('Invalid saved Codex thread. The session has not been replaced.');
  }
  const compatibleSavedThread =
    savedThread?.configurationVersion === THREAD_CONFIGURATION_VERSION ? savedThread : undefined;
  if (continuation && compatibleSavedThread?.approvalId !== continuation.approvalId) {
    throw new Error(
      'The saved Codex approval continuation is unavailable. It has not been replaced.',
    );
  }
  const child = spawn(
    command,
    [
      'app-server',
      '--listen',
      'stdio://',
      '-c',
      'model_provider="course_agent"',
      '-c',
      'model_providers.course_agent.name="OpenAI"',
      '-c',
      `model_providers.course_agent.base_url=${JSON.stringify(baseUrl)}`,
      '-c',
      'model_providers.course_agent.env_key="OPENAI_API_KEY"',
      '-c',
      'model_providers.course_agent.wire_api="responses"',
      '-c',
      'model_providers.course_agent.supports_websockets=false',
      '-c',
      'web_search="live"',
    ],
    {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd,
      env: { ...process.env, CODEX_HOME: codexHome },
    },
  );
  const lines = createInterface({ input: child.stdout });
  const exited = new Promise((resolve) => child.once('close', resolve));
  let spawnError;
  child.on('error', (error) => {
    spawnError = error;
    lines.close();
  });
  const terminate = () => child.kill('SIGTERM');
  process.on('SIGTERM', terminate);
  process.on('SIGINT', terminate);
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  child.stdin.on('error', () => {
    /* Process exit is reported below. */
  });
  let threadId;
  let pausedApproval;
  const saveThread = async (approvalId) => {
    await writeFile(
      `${threadFile}.tmp`,
      JSON.stringify({ threadId, configurationVersion: THREAD_CONFIGURATION_VERSION, approvalId }),
    );
    await rename(`${threadFile}.tmp`, threadFile);
  };
  try {
    send({
      id: 0,
      method: 'initialize',
      params: {
        clientInfo: { name: 'prairielearn_course_agent', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      },
    });
    for await (const line of lines) {
      const message = JSON.parse(line);
      if ('id' in message && message.method) {
        if (
          message.method === 'item/tool/call' &&
          message.params?.tool === 'push_sync' &&
          message.params.threadId === threadId
        ) {
          try {
            pausedApproval = await requestApproval(cwd);
          } catch (error) {
            send({
              id: message.id,
              result: {
                success: false,
                contentItems: [{ type: 'inputText', text: error.message }],
              },
            });
            continue;
          }
          await saveThread(pausedApproval);
          send({
            id: 3,
            method: 'turn/interrupt',
            params: { threadId, turnId: message.params.turnId },
          });
          continue;
        }
        // Unexpected interactive requests must fail closed, never receive blanket approval.
        send({
          id: message.id,
          error: { code: -32601, message: 'Interactive requests are not supported' },
        });
      } else if (message.error) {
        throw new Error(message.error.message);
      } else if (message.id === 0) {
        send({ method: 'initialized', params: {} });
        send({
          id: 1,
          method: compatibleSavedThread ? 'thread/resume' : 'thread/start',
          params: {
            model,
            cwd,
            ...(compatibleSavedThread
              ? { threadId: compatibleSavedThread.threadId }
              : { ephemeral: false, dynamicTools: [pushTool] }),
            approvalPolicy: 'on-request',
            approvalsReviewer: 'auto_review',
            sandbox: 'workspace-write',
            // Load the entrypoint explicitly; discovery does not include this image-owned directory.
            developerInstructions: `Use the bundled course-content-authoring skill below for applicable requests. Its file is ${skillPath}; resolve its relative references from that directory.\n\n${skill}\n\nBasic Homework example (adapt the UUID, title, number and question IDs; not a request to create this exact assessment):\n${assessmentExample}`,
          },
        });
      } else if (message.id === 1) {
        threadId = message.result.thread.id;
        // Persist before starting the turn so an interrupted run can still be resumed.
        await saveThread(compatibleSavedThread?.approvalId);
        emit({ method: 'thread/started', params: { thread: { id: threadId } } });
        const input =
          !compatibleSavedThread && history.length > 0
            ? `Recovered conversation (JSON transcript, not a new request; files may reflect only the last saved workspace):\n${JSON.stringify(history)}\n\nCurrent request:\n${contextualPrompt}`
            : contextualPrompt;
        send({
          id: 2,
          method: 'turn/start',
          params: {
            threadId,
            ...(continuation
              ? {
                  input: [],
                  toolOutput: { name: 'push_sync', output: JSON.stringify(continuation) },
                }
              : { input: [{ type: 'text', text: input }] }),
          },
        });
      } else if (message.method && message.params?.threadId === threadId) {
        if (message.method === 'turn/completed' && pausedApproval) {
          if (message.params.turn.status !== 'interrupted') {
            throw new Error('Could not pause Codex for approval');
          }
          emit({ method: 'course_agent/approvalPaused', params: { approvalId: pausedApproval } });
          return;
        }
        if (
          [
            'item/started',
            'item/completed',
            'item/agentMessage/delta',
            'thread/tokenUsage/updated',
            'turn/completed',
          ].includes(message.method)
        ) {
          emit(message);
        }
        if (message.method === 'turn/completed') {
          if (message.params.turn.status !== 'completed') {
            throw new Error(message.params.turn.error?.message ?? 'Agent turn did not complete');
          }
          await saveThread(undefined);
          return;
        }
      }
    }
    throw spawnError ?? new Error('Codex exited before completing the turn');
  } finally {
    lines.close();
    child.stdin.end();
    terminate();
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    await exited;
    clearTimeout(timer);
    process.off('SIGTERM', terminate);
    process.off('SIGINT', terminate);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const request = JSON.parse(await readFile(process.argv[3], 'utf8'));
  runCodex({
    model: process.argv[2],
    prompt: request.prompt,
    history: request.history,
    authoringContext: request.authoringContext,
    request: request.request,
    continuation: request.continuation,
    codexHome: '/workspace/.course-agent/codex',
    emit: (event) => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    },
  }).catch((error) => {
    process.stdout.write(`${JSON.stringify({ type: 'error', message: error.message })}\n`);
    process.exitCode = 1;
  });
}
