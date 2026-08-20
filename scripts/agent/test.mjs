import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { localCapabilitySecret, repositoryRoot } from './local-config.mjs';

const outputDirectory = await fsPromises.mkdtemp(
  path.join(os.tmpdir(), 'prairielearn-agent-test-'),
);
const logPath = path.join(outputDirectory, 'agent-test.log');
const log = fs.createWriteStream(logPath, { flags: 'a' });
const workerPort = process.env.AGENT_WORKER_PORT ?? '8787';

process.stdout.write(`Agent test output: ${outputDirectory}\n`);

try {
  const docker = spawnSync('docker', ['info'], { cwd: repositoryRoot, stdio: 'ignore' });
  if (docker.status !== 0) {
    throw new Error('Docker is required for the Cloudflare Sandbox. Start Docker and try again.');
  }

  await run('pnpm', ['--filter', '@prairielearn/agent-protocol', 'build']);
  await run('pnpm', ['--filter', '@prairielearn/agent-protocol', 'test']);
  await run('pnpm', ['--filter', '@prairielearn/agent-worker', 'build']);
  await run('pnpm', ['--filter', '@prairielearn/agent-worker', 'test:unit']);
  await run('pnpm', [
    'test',
    'apps/prairielearn/src/lib/agent-capability.test.ts',
    'apps/prairielearn/src/models/agent-conversation.test.ts',
    'apps/prairielearn/src/mcp/tools/query-course-data.test.ts',
    'apps/prairielearn/src/tests/agentConversations.test.ts',
    'apps/prairielearn/src/pages/instructorAgentConversations/components/AgentConversationsPage.test.tsx',
  ]);

  const smokeStatePath = path.join(outputDirectory, 'smoke-state.json');
  let worker = startWorker();
  try {
    await waitForWorker(worker);
    await run(
      'pnpm',
      ['--filter', '@prairielearn/agent-worker', 'test:smoke', '--', 'start', smokeStatePath],
      { AGENT_WORKER_URL: `http://localhost:${workerPort}` },
    );
    worker.kill('SIGTERM');
    await waitForExit(worker);
    await waitForWorkerShutdown();
    worker = startWorker();
    await waitForWorker(worker);
    await run(
      'pnpm',
      ['--filter', '@prairielearn/agent-worker', 'test:smoke', '--', 'resume', smokeStatePath],
      { AGENT_WORKER_URL: `http://localhost:${workerPort}` },
    );
    await run(
      'pnpm',
      [
        '--filter',
        '@prairielearn/prairielearn',
        'test:e2e',
        'src/tests/e2e/agentConversations.spec.ts',
      ],
      { AGENT_WORKER_URL: `http://localhost:${workerPort}` },
    );
  } finally {
    worker.kill('SIGTERM');
    await waitForExit(worker);
  }

  process.stdout.write(`Agent MVP tests passed. Logs: ${logPath}\n`);
} catch (error) {
  process.stderr.write(`Agent MVP tests failed. Logs: ${logPath}\n`);
  throw error;
} finally {
  log.end();
}

function startWorker() {
  const stateDirectory = path.join(outputDirectory, 'wrangler-state');
  const workerDirectory = path.join(repositoryRoot, 'apps', 'agent-worker');
  const worker = spawn(
    path.join(workerDirectory, 'node_modules', '.bin', 'wrangler'),
    [
      'dev',
      '--local',
      '--port',
      workerPort,
      '--persist-to',
      stateDirectory,
      '--var',
      'LOCAL_DEVELOPMENT:true',
      '--var',
      'AGENT_WORKER_ENABLED:true',
      '--var',
      `AGENT_CAPABILITY_SECRET:${localCapabilitySecret}`,
    ],
    { cwd: workerDirectory, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  worker.stdout.pipe(process.stdout);
  worker.stderr.pipe(process.stderr);
  worker.stdout.pipe(log, { end: false });
  worker.stderr.pipe(log, { end: false });
  return worker;
}

async function waitForWorker(worker) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) {
      throw new Error(`Wrangler exited before becoming healthy (${worker.exitCode}).`);
    }
    try {
      const response = await fetch(`http://localhost:${workerPort}/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.enabled === true) return;
      }
    } catch {
      // Wrangler may take a few minutes to build the Sandbox image on the first run.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Wrangler did not become healthy within three minutes.');
}

async function waitForWorkerShutdown() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://localhost:${workerPort}/health`);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Wrangler did not release its local port after shutdown.');
}

async function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const { code, signal } = await waitForExit(child);
  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`);
  }
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve({ code: child.exitCode, signal: null });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}
