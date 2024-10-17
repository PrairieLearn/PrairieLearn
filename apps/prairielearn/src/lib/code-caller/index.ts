// @ts-check
import * as os from 'node:os';

import debugfn from 'debug';
import { createPool, type Pool } from 'generic-pool';
import { v4 as uuidv4 } from 'uuid';

import { logger } from '@prairielearn/logger';
import { run } from '@prairielearn/run';
import * as Sentry from '@prairielearn/sentry';

import * as chunks from '../chunks.js';
import { config } from '../config.js';
import { type Course } from '../db-types.js';
import * as load from '../load.js';

import { CodeCallerContainer, init as initCodeCallerDocker } from './code-caller-container.js';
import { CodeCallerNative } from './code-caller-native.js';
import { type CodeCaller, FunctionMissingError } from './code-caller-shared.js';

const debug = debugfn('prairielearn:code-caller');

/**
 * This module maintains a pool of CodeCaller workers, which are used any
 * time we need to execute Python code (elements, question code, etc.).
 *
 * Load is reported in:
 * - python_worker_active: number of python workers currently processing jobs/callbacks
 * - python_worker_idle: number of python workers available for incoming jobs/callbacks
 * - python_callback_waiting: number of queued jobs/callbacks waiting for an available worker
 */

let pool: Pool<CodeCaller> | null = null;

export async function init() {
  debug('init()');

  const { workersExecutionMode } = config;
  if (!['container', 'native', 'disabled'].includes(workersExecutionMode)) {
    throw new Error(`unknown config.workersExecutionMode: ${workersExecutionMode}`);
  }

  if (workersExecutionMode === 'disabled') {
    return;
  }

  if (workersExecutionMode === 'container') {
    await initCodeCallerDocker();
  }

  const numWorkers = config.workersCount ?? Math.ceil(config.workersPerCpu * os.cpus().length);
  pool = createPool<CodeCaller>(
    {
      create: async () => {
        const codeCallerOptions = {
          questionTimeoutMilliseconds: config.questionTimeoutMilliseconds,
          pingTimeoutMilliseconds: config.workerPingTimeoutMilliseconds,
          errorLogger: logger.error.bind(logger),
        };

        const codeCaller = run(() => {
          if (workersExecutionMode === 'container') {
            return new CodeCallerContainer(codeCallerOptions);
          } else if (workersExecutionMode === 'native') {
            return new CodeCallerNative(codeCallerOptions);
          } else {
            throw new Error(`Unexpected workersExecutionMode: ${workersExecutionMode}`);
          }
        });

        await codeCaller.ensureChild();
        load.startJob('python_worker_idle', codeCaller.uuid);
        return codeCaller;
      },
      destroy: async (codeCaller) => {
        logger.info(
          `Destroying Python worker ${codeCaller.uuid} (last course path: ${codeCaller.getCoursePath()})`,
        );
        load.endJob('python_worker_idle', codeCaller.uuid);
        codeCaller.done();
      },
    },
    {
      min: numWorkers,
      max: numWorkers,
    },
  );

  pool.on('factoryCreateError', (err) => {
    logger.error('Error creating Python worker', err);
    Sentry.captureException(err);
  });

  pool.on('factoryDestroyError', (err) => {
    logger.error('Error destroying Python worker', err);
    Sentry.captureException(err);
  });

  // Ensure that the workers are ready; this will ensure that we're ready to
  // execute code as soon as we start processing requests.
  //
  // We skip this if we're running in dev mode, as we want to prioritize the
  // speed of starting up the server to ensure running in watch mode is as
  // fast as possible.
  //
  // Note: if resource creation fails for any reason, this will never resolve
  // or reject. This is unfortunate, but we'll still log and report the error
  // above, so it won't fail totally silently. If we fail to create workers,
  // we have a bigger problem.
  if (!config.devMode) {
    await pool.ready();
  }
}

export async function finish() {
  debug('finish(): waiting for pool to drain');
  await pool?.drain();
  await pool?.clear();
  pool = null;
  debug('finish(): pool finished draining');
}

export function getMetrics() {
  return {
    size: pool?.size ?? 0,
    available: pool?.available ?? 0,
    borrowed: pool?.borrowed ?? 0,
    pending: pool?.pending ?? 0,
  };
}

/**
 * Acquires a Python worker and automatically returns it to the pool or
 * disposes of it once it has been used.
 */
export async function withCodeCaller<T>(
  course: Course,
  fn: (codeCaller: CodeCaller) => Promise<T>,
): Promise<T> {
  if (config.workersExecutionMode === 'disabled') {
    throw new Error('Code execution is disabled');
  }

  if (!pool) {
    throw new Error('CodeCaller pool not initialized');
  }

  if (pool.available === 0 && !config.workerUseQueue) {
    debug('getPythonCaller(): no workers available, waiting to error');
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('Server is overloaded. Please try again.'));
      }, config.workerOverloadDelayMS);
    });
  }

  const jobUuid = uuidv4();
  load.startJob('python_callback_waiting', jobUuid);

  const codeCaller = await pool.acquire();

  try {
    const coursePath = chunks.getRuntimeDirectoryForCourse(course);
    await codeCaller.prepareForCourse({
      coursePath,
      forbiddenModules: [],
    });
  } catch (err) {
    // If we fail to prepare for a course, assume that the code caller is
    // broken and dispose of it.
    await pool.destroy(codeCaller);
    throw err;
  } finally {
    load.endJob('python_callback_waiting', jobUuid);
  }

  debug(`getPythonCaller(): got ${codeCaller.uuid}`);
  load.endJob('python_worker_idle', codeCaller.uuid);
  load.startJob('python_worker_active', codeCaller.uuid);

  let fnResult, fnErr;
  try {
    fnResult = await fn(codeCaller);
  } catch (err) {
    fnErr = err;
  }

  debug('returnPythonCaller()');
  load.endJob('python_worker_active', codeCaller.uuid);

  let needsFullRestart = false;
  let restartErr;
  try {
    const restartSuccess = await codeCaller.restart();
    if (!restartSuccess) {
      debug('returnPythonCaller(): restart requested a full restart');
      // no error logged here, everything is still ok
      needsFullRestart = true;
    }
  } catch (err) {
    restartErr = err;
    debug(`returnPythonCaller(): restart errored: ${err}`);
    logger.error('Error restarting pythonCaller', err);
    needsFullRestart = true;
  }

  load.startJob('python_worker_idle', codeCaller.uuid);

  if (needsFullRestart) {
    await pool.destroy(codeCaller);
  } else {
    await pool.release(codeCaller);
  }

  const overallErr = fnErr ?? restartErr;
  if (overallErr) {
    throw overallErr;
  } else {
    // TypeScript doesn't understand our error-handling logic above. If
    // `overallErr` is falsy, `fnResult` will indeed have type `T`. We'll
    // cast it to `T` to appease TypeScript.
    return fnResult as T;
  }
}

export { FunctionMissingError, CodeCaller };
