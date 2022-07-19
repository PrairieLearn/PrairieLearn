// @ts-check
const os = require('os');
const path = require('path');
const genericPool = require('generic-pool');
const { v4: uuidv4 } = require('uuid');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('../logger');
const config = require('../config');
const load = require('../load');
const { DockerCaller, init: initCodeCallerDocker } = require('./code-caller-docker');
const { PythonCaller } = require('./code-caller-python');
const { FunctionMissingError } = require('./code-caller-shared');

/**
 * This module maintains a pool of PythonCaller workers, which are used any
 * time we need to execute Python code (elements, question code, etc.).
 *
 * Load is reported in:
 * - python_worker_active: number of python workers currently processing jobs/callbacks
 * - python_worker_idle: number of python workers available for incoming jobs/callbacks
 * - python_callback_waiting: number of queued jobs/callbacks waiting for an available worker
 */

/** @typedef {import('./code-caller-shared').CodeCaller} CodeCaller*/

/** @type {import('generic-pool').Pool<CodeCaller>} */
let pool = null;

module.exports = {
  async init() {
    debug('init()');

    const { workersExecutionMode } = config;
    if (workersExecutionMode !== 'container' && workersExecutionMode !== 'native') {
      throw new Error(`unknown config.workersExecutionMode: ${workersExecutionMode}`);
    }

    if (config.workersExecutionMode === 'container') {
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
          let pc;
          if (workersExecutionMode === 'container') {
            pc = new DockerCaller(codeCallerOptions);
          } else if (workersExecutionMode === 'native') {
            pc = new PythonCaller(codeCallerOptions);
          }
          pc.ensureChild();
          load.startJob('python_worker_idle', pc.uuid);
          return pc;
        },
        destroy: async (pc) => {
          load.endJob('python_worker_idle', pc.uuid);
          pc.done();
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
    await pool.drain();
    await pool.clear();
    debug('finish(): pool finished draining');
  },

  /**
   * Acquires a Python worker and automatically returns it to the pool or
   * disposes of it once it has been used.
   *
   * @template T
   * @param {string} coursePath
   * @param {(pc: CodeCaller) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withPythonCaller(coursePath, fn) {
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

    const pc = await pool.acquire();

    try {
      await pc.prepareForCourse(coursePath);
    } catch (err) {
      // If we fail to prepare for a course, assume that the code caller is
      // broken and dispose of it.
      await pool.destroy(pc);
      throw err;
    }

    debug(`getPythonCaller(): got ${pc.uuid}`);
    load.endJob('python_callback_waiting', jobUuid);
    load.endJob('python_worker_idle', pc.uuid);
    load.startJob('python_worker_active', pc.uuid);

    let fnErr, fnResult;
    try {
      fnResult = await fn(pc);
    } catch (err) {
      fnErr = err;
    }

    debug('returnPythonCaller()');
    load.endJob('python_worker_active', pc.uuid);

    let needsFullRestart = false;
    let restartErr;
    try {
      const restartSuccess = await pc.restart();
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

    load.startJob('python_worker_idle', pc.uuid);

    if (needsFullRestart) {
      await pool.destroy(pc);
    } else {
      await pool.release(pc);
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
