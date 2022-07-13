// @ts-check
const os = require('os');
const path = require('path');
const genericPool = require('generic-pool');
const { v4: uuidv4 } = require('uuid');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const util = require('util');

const logger = require('./logger');
const config = require('./config');
const load = require('./load');
const { DockerCaller } = require('./code-caller-docker');
const { PythonCaller } = require('./code-caller-python');

/**
 * This module maintains a pool of PythonCaller workers, which are used any
 * time we need to execute Python code (elements, question code, etc.).
 *
 * Load is reported in:
 * - python_worker_active: number of python workers currently processing jobs/callbacks
 * - python_worker_idle: number of python workers available for incoming jobs/callbacks
 * - python_callback_waiting: number of queued jobs/callbacks waiting for an available worker
 */

// TODO: write an interface for a code caller; use that instead of this type union.
/** @type {import('generic-pool').Pool<PythonCaller | DockerCaller>} */
let pool = null;

module.exports = {
  init() {
    debug('init()');
    const { workersExecutionMode } = config;
    let CodeCaller;
    if (workersExecutionMode === 'container') {
      CodeCaller = DockerCaller;
    } else if (workersExecutionMode === 'native') {
      CodeCaller = PythonCaller;
    } else {
      throw new Error(`unknown config.workersExecutionMode: ${workersExecutionMode}`);
    }

    const numWorkers = config.workersCount ?? Math.ceil(config.workersPerCpu * os.cpus().length);

    pool = genericPool.createPool(
      {
        create: async () => {
          const pc = new CodeCaller({
            questionTimeoutMilliseconds: config.questionTimeoutMilliseconds,
            errorLogger: logger.error,
          });
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

  async finishAsync() {
    debug('finish(): waiting for pool to drain');
    await pool.drain();
    await pool.clear();
    debug('finish(): pool finished draining');
  },

  finish(callback) {
    util.callbackify(module.exports.finishAsync)(callback);
  },

  /**
   * Acquires a Python worker and automatically returns it to the pool or
   * disposes of it once it has been used.
   *
   * @template T
   * @param {string} coursePath
   * @param {(pc: PythonCaller | DockerCaller) => Promise<T>} fn
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

    // TODO: make async
    await pc.prepareForCourse(coursePath);

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
      const restartSuccess = await pc.restartAsync();
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
};
