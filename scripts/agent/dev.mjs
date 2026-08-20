import { spawn, spawnSync } from 'node:child_process';

import { localCapabilitySecret, repositoryRoot, writeLocalAgentConfig } from './local-config.mjs';

const docker = spawnSync('docker', ['info'], { cwd: repositoryRoot, stdio: 'ignore' });
if (docker.status !== 0) {
  throw new Error('Docker is required for the Cloudflare Sandbox. Start Docker and try again.');
}

const { configPath, serverPort, stateDirectory, workerPort } = await writeLocalAgentConfig();
const processes = [
  spawn('pnpm', ['--filter', '@prairielearn/prairielearn', 'dev'], {
    cwd: repositoryRoot,
    env: { ...process.env, PL_CONFIG_PATH: configPath },
    stdio: 'inherit',
  }),
  spawn(
    'pnpm',
    [
      '--filter',
      '@prairielearn/agent-worker',
      'exec',
      'wrangler',
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
    { cwd: repositoryRoot, stdio: 'inherit' },
  ),
];

let stopping = false;

function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

try {
  await Promise.all([
    waitForHttp(`http://localhost:${serverPort}/pl/webhooks/ping`, processes[0]),
    waitForHttp(`http://localhost:${workerPort}/health`, processes[1]),
  ]);
} catch (error) {
  stop();
  throw error;
}

process.stdout.write(
  [
    '',
    'PrairieLearn cloud-agent development stack is ready:',
    `  PrairieLearn: http://localhost:${serverPort}`,
    `  Agent page: http://localhost:${serverPort}/pl/course/<course_id>/course_admin/agents`,
    `  Worker health: http://localhost:${workerPort}/health`,
    `  Wrangler state: ${stateDirectory}`,
    '  Feature flags: cloud-agent, cloud-agent-arbitrary-sql (development only)',
    '',
  ].join('\n'),
);

const results = await Promise.all(
  processes.map(
    (child) =>
      new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          stop();
          resolve({ code, signal });
        });
      }),
  ),
);
const failed = results.find(({ code, signal }) => code !== 0 && signal === null);
if (failed) process.exitCode = failed.code ?? 1;

async function waitForHttp(url, child) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${url} could not become ready because its process exited.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Both PrairieLearn and the first Sandbox image build can take time to start.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not become ready within three minutes.`);
}
