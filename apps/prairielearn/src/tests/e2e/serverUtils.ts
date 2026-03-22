/* eslint-disable react-hooks/rules-of-hooks */
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { WorkerInfo } from '@playwright/test';
import * as tmp from 'tmp-promise';

import type { Config } from '../../lib/config.js';

const BASE_PORT = 3014;

interface WorkerServerOptions {
  /** Additional course directories to include beyond the defaults */
  courseDirs?: string[];
}

/**
 * Sets up a worker-specific server instance with isolated database.
 * Handles database setup, config generation, and server lifecycle.
 */
export async function setupWorkerServer(
  workerInfo: WorkerInfo,
  use: (port: number) => Promise<void>,
  options: WorkerServerOptions = {},
): Promise<void> {
  // Pick a unique port based on the worker index.
  const port = BASE_PORT + workerInfo.workerIndex + 1;

  // Initialize the database with the test utils.
  const { setupDatabases, after: destroyDatabases } = await import('../helperDb.js');
  const setupResults = await setupDatabases({ configurePool: true });

  await tmp.withFile(
    async (tmpFile) => {
      // Construct a test-specific config and write it to disk.
      const config: Partial<Config> = {
        serverPort: String(port),
        postgresqlUser: setupResults.user,
        postgresqlDatabase: setupResults.database,
        postgresqlHost: setupResults.host,
        devMode: true, // We need this to start up the asset server.
        ...(options.courseDirs && { courseDirs: options.courseDirs }),
      };

      await fs.writeFile(tmpFile.path, JSON.stringify(config, null, 2));

      const { kill } = await startServerSubprocess(tmpFile.path);

      try {
        await use(port);
      } finally {
        // Clean up the server subprocess
        await kill();

        // Tear down the testing database.
        await destroyDatabases();
      }
    },
    { postfix: 'config.json' },
  );
}

/**
 * Starts the server as a subprocess and waits for it to be ready.
 * Returns a function to kill the subprocess.
 */
async function startServerSubprocess(
  configPath: string,
): Promise<{ serverProcess: ChildProcess; kill: () => Promise<void> }> {
  // We do this instead of importing the server.ts file directly because Playwright
  // doesn't respect tsconfig.json files.

  // See https://github.com/microsoft/playwright/issues/26936
  // and https://github.com/PrairieLearn/PrairieLearn/pull/13493
  // > For tsx transformations that add inject semantics (email, pdf),
  // > I would still recommend compiling the code with the production bundler that applies these
  // > semantics and only then test it with the test runner, Playwright or different.

  // We don't want to require building the production bundle for tests to make iteration speed faster.

  const serverDir = path.resolve(import.meta.dirname, '..', '..');

  const serverProcess = spawn('yarn', ['dev:no-watch'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PL_CONFIG_PATH: configPath,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Create a new process group so we can kill all child processes
    detached: true,
  });

  // Wait for the server to be ready by watching for the ready message
  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 60000;
    const timeout = setTimeout(() => {
      serverProcess.kill();
      reject(new Error(`Server did not start within ${timeoutMs}ms`));
    }, timeoutMs);

    const readyMessage = 'PrairieLearn server ready';

    const checkOutput = (data: Buffer) => {
      const output = data.toString();
      if (output.includes(readyMessage)) {
        clearTimeout(timeout);
        resolve();
      } else {
        process.stdout.write(output);
      }
    };

    serverProcess.stdout.on('data', checkOutput);
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(output);
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && code !== null) {
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  });

  const kill = async () => {
    return new Promise<void>((resolve) => {
      if (serverProcess.killed) {
        resolve();
        return;
      }

      serverProcess.on('exit', () => resolve());

      // Kill the entire process group (yarn + tsx + server) using negative PID
      // This ensures SIGTERM reaches the actual server process for graceful shutdown
      if (serverProcess.pid) {
        process.kill(-serverProcess.pid, 'SIGTERM');
      }

      // Force kill after 10 seconds if graceful shutdown doesn't work
      setTimeout(() => {
        if (!serverProcess.killed && serverProcess.pid) {
          try {
            process.kill(-serverProcess.pid, 'SIGKILL');
          } catch {
            // Process may have already exited
          }
        }
      }, 10000);
    });
  };

  return { serverProcess, kill };
}
