// @ts-check
const os = require('os');
const path = require('path');
const genericPool = require('generic-pool');
const { v4: uuidv4 } = require('uuid');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('../logger');
const config = require('../config');
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

/** @typedef {import('./code-caller-shared').CodeCaller} CodeCaller*/

/** @type {import('generic-pool').Pool<CodeCaller> | null} */
let pool = null;

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
            errorLogger: logger.error.bind(logger),
          };
          let codeCaller;
          if (workersExecutionMode === 'container') {
            codeCaller = new CodeCallerContainer(codeCallerOptions);
          } else if (workersExecutionMode === 'native') {
            codeCaller = new CodeCallerNative(codeCallerOptions);
          }
          codeCaller.ensureChild();
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
      }
    );
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
   * @param {string} coursePath
   * @param {(codeCaller: CodeCaller) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withCodeCaller(coursePath, fn) {
    if (config.workersExecutionMode === 'disabled') {
      throw new Error('Code execution is disabled');
    }

    if (pool.available === 0 && !config.workerUseQueue) {
      debug(`getPythonCaller(): no workers available, waiting to error`);
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
      await codeCaller.prepareForCourse(coursePath);
    } catch (err) {
      // If we fail to prepare for a course, assume that the code caller is
      // broken and dispose of it.
      await pool.destroy(codeCaller);
      throw err;
    }

    debug(`getPythonCaller(): got ${codeCaller.uuid}`);
    load.endJob('python_callback_waiting', jobUuid);
    load.endJob('python_worker_idle', codeCaller.uuid);
    load.startJob('python_worker_active', codeCaller.uuid);

    let fnErr, fnResult;
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
      debug('returnPythonCaller(): restart returned error: ${err}');
      logger.error(`Error restarting pythonCaller: ${err}`);
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
      return fnResult;
    }
  },

  FunctionMissingError,
};
