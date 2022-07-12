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
const codeCaller = require('./code-caller');

/**
 * At any time we have a set of pythonCallers, which are python workers
 * that can process jobs, and callbacks, which are the jobs
 * themselves. We might have more than enough pythonCallers, so there are
 * some sitting around idle, or we might have not enough, so that we need
 * to queue up callbacks until we get an available pythonCaller to handle
 * them.
 *
 * Load is reported in:
 * - python_worker_active: number of python workers currently processing jobs/callbacks
 * - python_worker_idle: number of python workers available for incoming jobs/callbacks
 * - python_callback_waiting: number of queued jobs/callbacks waiting for an available worker
 */

/** @type {import('generic-pool').Pool<codeCaller.PythonCaller>} */
let pool = null;

module.exports = {
  init() {
    debug('init()');
    const numWorkers = config.workersCount ?? Math.ceil(config.workersPerCpu * os.cpus().length);
    pool = genericPool.createPool(
      {
        create: async () => {
          const pc = new codeCaller.PythonCaller();
          pc.ensureChild();
          load.startJob('python_worker_idle', pc.uuid);
          return pc;
        },
        destroy: async (pc) => {
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

  getPythonCaller(callback) {
    const jobUuid = uuidv4();
    load.startJob('python_callback_waiting', jobUuid);

    debug('getPythonCaller()');
    if (!config.workerUseQueue) {
      debug(`getPythonCaller(): no workers available, waiting to error`);
      setTimeout(() => {
        debug(`getPythonCaller(): no workers available, reporting error`);
        callback(new Error('Server is overloaded. Please try again.'));
      }, config.workerOverloadDelayMS);
    }

    pool.acquire().then(
      (pc) => {
        debug(`getPythonCaller(): got ${pc.uuid}`);
        load.endJob('python_callback_waiting', jobUuid);
        load.endJob('python_worker_idle', pc.uuid);
        load.startJob('python_worker_active', pc.uuid);
        callback(null, pc);
      },
      (err) => {
        callback(err);
      }
    );
  },

  returnPythonCaller(pc, callback) {
    debug('returnPythonCaller()');
    load.endJob('python_worker_active', pc.uuid);
    callback(null);
    pc.restart((err, success) => {
      let needsFullRestart = false;
      if (err) {
        debug('returnPythonCaller(): restart returned error: ${err}');
        logger.error(`Error restarting pythonCaller: ${err}`);
        needsFullRestart = true;
      } else {
        if (!success) {
          debug('returnPythonCaller(): restart requested a full restart');
          // no error logged here, everything is still ok
          needsFullRestart = true;
        }
      }

      load.startJob('python_worker_idle', pc.uuid);
      if (needsFullRestart) {
        pool.destroy(pc);
      } else {
        pool.release(pc);
      }
    });
  },
};
