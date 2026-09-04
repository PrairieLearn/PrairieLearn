import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

// App-server, unlike exec --json, exposes incremental agent-message text.
export async function runCodex({
  model,
  prompt,
  emit,
  command = 'codex',
  baseUrl = 'https://api.openai.com/v1',
  cwd = process.cwd(),
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
  const codexHome = await mkdtemp(join(tmpdir(), 'pl-course-agent-'));
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
          method: 'thread/start',
          params: {
            model,
            cwd,
            ephemeral: true,
            approvalPolicy: 'on-request',
            approvalsReviewer: 'auto_review',
            sandbox: 'workspace-write',
            // Load the entrypoint explicitly; discovery does not include this image-owned directory.
            developerInstructions: `Use the bundled course-content-authoring skill below for applicable requests. Its file is ${skillPath}; resolve its relative references from that directory.\n\n${skill}\n\nBasic Homework example (adapt the UUID, title, number and question IDs; not a request to create this exact assessment):\n${assessmentExample}`,
          },
        });
      } else if (message.id === 1) {
        threadId = message.result.thread.id;
        emit({ method: 'thread/started', params: { thread: { id: threadId } } });
        send({
          id: 2,
          method: 'turn/start',
          params: {
            threadId,
            input: [{ type: 'text', text: prompt }],
          },
        });
      } else if (message.method && message.params?.threadId === threadId) {
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
    await rm(codexHome, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCodex({
    model: process.argv[2],
    prompt: process.argv[3],
    emit: (event) => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    },
  }).catch((error) => {
    process.stdout.write(`${JSON.stringify({ type: 'error', message: error.message })}\n`);
    process.exitCode = 1;
  });
}
