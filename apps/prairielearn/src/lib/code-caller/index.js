// @ts-check
const os = require('os');
const path = require('path');
const genericPool = require('generic-pool');
const { v4: uuidv4 } = require('uuid');
const Sentry = require('@prairielearn/sentry');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { setTimeout: sleep } = require('node:timers/promises');

const { logger } = require('@prairielearn/logger');
const { config } = require('../config');
const chunks = require('../chunks');
const { features } = require('../features');
const load = require('../load');
const { CodeCallerContainer, init: initCodeCallerDocker } = require('./code-caller-container');
const { CodeCallerNative } = require('./code-caller-native');
const { FunctionMissingError } = require('./code-caller-shared');

/**
 * This module maintains a pool of CodeCaller workers, which are used any
 * time we need to execute Python code (elements, question code, etc.).
 *
 * Load is reported in:
 * - python_worker_active: number of python workers currently processing jobs/callbacks
 * - python_worker_idle: number of python workers available for incoming jobs/callbacks
 * - python_callback_waiting: number of queued jobs/callbacks waiting for an available worker
 */

/** @typedef {import('./code-caller-shared').CodeCaller} CodeCaller */

/** @type {import('generic-pool').Pool<CodeCaller> | null} */
let pool = null;

/** @type {Set<CodeCaller>} */
let unhealthyCodeCallers = new Set();

async function getHealthyCodeCaller() {
  if (!pool) {
    throw new Error('CodeCaller pool not initialized');
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const codeCaller = await pool.acquire();
    if (!unhealthyCodeCallers.has(codeCaller)) {
      return codeCaller;
    }
    await pool.release(codeCaller);
    await sleep(0);
  }
}

function destroyUnhealthyCodeCallers() {
  unhealthyCodeCallers.forEach((codeCaller) => {
    // Delete from the set first. That way, if `pool.destroy()` is still running
    // on the next tick of this `destroyUnhealthyCodeCallers()` function, we
    // won't try to destroy it again.
    unhealthyCodeCallers.delete(codeCaller);
    pool?.destroy(codeCaller).catch((err) => {
      logger.error('Error destroying unhealthy Python worker', err);
      Sentry.captureException(err);
    });
  });

  // Unref the timeout so that it doesn't keep the process alive.
  setTimeout(destroyUnhealthyCodeCallers, 100).unref();
}

module.exports = {
  async init() {
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
    pool = genericPool.createPool(
      {
        create: async () => {
          let codeCallerOptions = {
            questionTimeoutMilliseconds: config.questionTimeoutMilliseconds,
            pingTimeoutMilliseconds: config.workerPingTimeoutMilliseconds,
            errorLogger: logger.error.bind(logger),
          };
          let codeCaller;
          if (workersExecutionMode === 'container') {
            codeCaller = new CodeCallerContainer(codeCallerOptions);
          } else if (workersExecutionMode === 'native') {
            codeCaller = new CodeCallerNative(codeCallerOptions);
          } else {
            throw new Error(`Unexpected workersExecutionMode: ${workersExecutionMode}`);
          }
          await codeCaller.ensureChild();
          load.startJob('python_worker_idle', codeCaller.uuid);
          return codeCaller;
        },
        destroy: async (codeCaller) => {
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

    // This is part of a huge kludge we use to work around the fact that Sentry
    // uses domains. We need to ensure that new code callers are only created
    // outside the context of the domain of a request. Otherwise, if a request
    // has very large objects associated with it (e.g. `res.locals` for a large
    // submission), those objects will be kept alive forever by the domain, which
    // ends up being associated with the Docker HTTP client that survives for
    // the lifetime of the container.
    //
    // To work around this, instead of calling `pool.destroy(codeCaller)`
    // immediately after an error, we'll add the code caller to a set of
    // unhealthy ones. This `destroyUnhealthyCodeCallers()` function will then
    // execute at a regular interval and destroy any unhealthy code callers.
    //
    // See https://github.com/getsentry/sentry-javascript/issues/7031 for more
    // details. If they ever switch to using AsyncLocalStorage, we can remove
    // this and destroy code callers as soon as they become unhealthy.
    destroyUnhealthyCodeCallers();

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
  },

  async finish() {
    debug('finish(): waiting for pool to drain');
    await pool?.drain();
    await pool?.clear();
    pool = null;
    debug('finish(): pool finished draining');
  },

  /**
   * Acquires a Python worker and automatically returns it to the pool or
   * disposes of it once it has been used.
   *
   * @template T
   * @param {import('../db-types').Course} course
   * @param {(codeCaller: CodeCaller) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withCodeCaller(course, fn) {
    if (config.workersExecutionMode === 'disabled') {
      throw new Error('Code execution is disabled');
    }

    if (!pool) {
      throw new Error('CodeCaller pool not initialized');
    }

    if (pool.available === 0 && !config.workerUseQueue) {
      debug(`getPythonCaller(): no workers available, waiting to error`);
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('Server is overloaded. Please try again.'));
        }, config.workerOverloadDelayMS);
      });
    }

    // Determine if this course is allowed to use `rpy2`.
    const allowRpy2 = await features.enabled('allow-rpy2', {
      institution_id: course.institution_id,
      course_id: course.id,
    });

    const jobUuid = uuidv4();
    load.startJob('python_callback_waiting', jobUuid);

    const codeCaller = await getHealthyCodeCaller();

    try {
      const coursePath = chunks.getRuntimeDirectoryForCourse(course);
      await codeCaller.prepareForCourse({
        coursePath,
        forbiddenModules: allowRpy2 ? [] : ['rpy2'],
      });
    } catch (err) {
      // If we fail to prepare for a course, assume that the code caller is
      // broken and dispose of it.
      unhealthyCodeCallers.add(codeCaller);
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
      unhealthyCodeCallers.add(codeCaller);
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
      return /** @type {T} */ (fnResult);
    }
  },

  FunctionMissingError,
};
