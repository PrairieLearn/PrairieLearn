// @ts-check
const ERR = require('async-stacktrace');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('./logger');
const config = require('./config');
const load = require('./load');
const { DockerCaller } = require('./code-caller-docker');
const { PythonCaller } = require('./code-caller-python');

/*
At any time we have a set of pythonCallers, which are python workers
that can process jobs, and callbacks, which are the jobs
themselves. We might have more than enough pythonCallers, so there are
some sitting around idle, or we might have not enough, so that we need
to queue up callbacks until we get an available pythonCaller to handle
them.

We maintain two FIFO queues, one for available pythonCallers (if any)
and one for waiting callbacks (if any). At any time at least one of
these queues must be empty.

Load is reported in:
- python_worker_active: number of python workers currently processing jobs/callbacks
- python_worker_idle: number of python workers available for incoming jobs/callbacks
- python_callback_waiting: number of queued jobs/callbacks waiting for an available worker

*/

/** @typedef {PythonCaller | DockerCaller } CodeCaller */

/**
 * All pythonCallers, whether available for work or currently busy
 *
 * @type {CodeCaller[]}
 */
let pythonCallers = [];

/**
 * FIFO queue for available pythonCallers waiting for a job/callback
 *
 * @type {CodeCaller[]}
 */
let availablePythonCallers = [];

/**
 * FIFO queue for jobs/callbacks waiting for an available pythonCaller
 * @type {Array<[string, CodeCaller]>}
 */
let waitingCallbacks = [];

// Will be set to the appropriate class in init()
let CodeCaller = null;

module.exports = {
  init() {
    debug('init()');
    const { workersExecutionMode } = config;
    if (workersExecutionMode === 'container') {
      CodeCaller = DockerCaller;
    } else if (workersExecutionMode === 'native') {
      CodeCaller = PythonCaller;
    } else {
      throw new Error(`unknown config.workersExecutionMode: ${workersExecutionMode}`);
    }

    var numWorkers = config.workersCount;
    if (numWorkers == null) {
      numWorkers = Math.ceil(config.workersPerCpu * os.cpus().length);
    }

    for (let i = 0; i < numWorkers; i++) {
      const pc = new CodeCaller({
        questionTimeoutMilliseconds: config.questionTimeoutMilliseconds,
      });
      pc.number = i;
      pythonCallers.push(pc);
      load.startJob('python', pc.uuid);
      load.startJob('python_worker_idle', pc.uuid);
      availablePythonCallers.push(pc);
    }
    module.exports._warmUpWorkers();
  },

  finish(callback) {
    debug('finish()');

    const testFinished = () => {
      if (availablePythonCallers.length < pythonCallers.length) {
        // keep waiting for all code callers to be returned
        debug('finish(): waiting for availablePythonCallers');
        setTimeout(testFinished, 100);
      } else {
        debug('finish(): calling done() on all pythonCallers');
        for (let i = 0; i < pythonCallers.length; i++) {
          pythonCallers[i].done();
        }
        pythonCallers = [];
        availablePythonCallers = [];
        return callback(null);
      }
    };

    testFinished();
  },

  /**
   * @param {string} coursePath
   */
  getPythonCaller(coursePath, callback) {
    debug('getPythonCaller()');
    if (pythonCallers.length === 0) return callback(new Error('no PythonCallers initialized'));
    if (availablePythonCallers.length > 0) {
      const pc = availablePythonCallers[0];
      availablePythonCallers = availablePythonCallers.slice(1);
      load.endJob('python_worker_idle', pc.uuid);
      debug(`getPythonCaller(): got ${pc.number}`);
      load.startJob('python_worker_active', pc.uuid);
      pc.prepareForCourse(coursePath, (err) => {
        if (ERR(err, callback)) return;
        callback(null, pc);
      });
      callback(null, pc);
    } else {
      if (config.workerUseQueue) {
        debug(`getPythonCaller(): adding to waitingCallbacks`);
        callback.__load_uuid = uuidv4();
        load.startJob('python_callback_waiting', callback.__load_uuid);
        waitingCallbacks.push([coursePath, callback]);
      } else {
        debug(`getPythonCaller(): no workers available, waiting to error`);
        setTimeout(() => {
          debug(`getPythonCaller(): no workers available, reporting error`);
          callback(new Error('Server is overloaded. Please try again.'));
        }, config.workerOverloadDelayMS);
      }
    }
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
      if (needsFullRestart) {
        const i = pc.number;
        pc.done();
        load.endJob('python', pc.uuid);
        debug('returnPythonCaller(): making new pythonCaller');
        pc = new CodeCaller({ questionTimeoutMilliseconds: config.questionTimeoutMilliseconds });
        pc.number = i;
        pythonCallers[i] = pc;
        load.startJob('python', pc.uuid);
      }

      // by this point either the restart succeeded or we have a brand new PythonCaller
      if (waitingCallbacks.length > 0) {
        debug('returnPythonCaller(): passing to a waiting callback');
        const [course, cb] = waitingCallbacks[0];
        waitingCallbacks = waitingCallbacks.slice(1);
        load.endJob('python_callback_waiting', cb.__load_uuid);
        load.startJob('python_worker_active', pc.uuid);
        pc.prepareForCourse(course, (err) => {
          if (ERR(err, cb)) return;
          cb(null, pc);
        });
      } else {
        debug('returnPythonCaller(): pushing back onto availablePythonCallers');
        load.startJob('python_worker_idle', pc.uuid);
        availablePythonCallers.push(pc);
      }
    });
  },

  _warmUpWorkers() {
    debug('_warmUpWorkers()');

    // call ensureChild() on each pythonCaller, if it's available,
    // waiting between each one
    const callers = availablePythonCallers;
    let iCaller = 0;

    const startNextCaller = () => {
      debug(`_warmUpWorkers(): start worker ${iCaller}`);
      // start caller number iCaller if it's available
      for (let i = 0; i < availablePythonCallers.length; i++) {
        if (callers[i].number === iCaller) {
          debug(
            `_warmUpWorkers(): running availablePythonCallers[${i}].ensureChild() for worker number ${availablePythonCallers[i].number}`
          );
          // Passively ignore errors here for now - if the caller ends up
          // in a bad state, that'll be reported when we try to call it
          // and we'll know to restart it then.
          callers[i]
            .ensureChild()
            .catch((err) => logger.error('Failed to ensure child for worker', err));
          break;
        }
      }
      iCaller++;
      if (iCaller < pythonCallers.length) {
        // still have more to start, so wait and then proceed
        setTimeout(startNextCaller, config.workerWarmUpDelayMS);
      } else {
        debug(`_warmUpWorkers(): completed warm up`);
      }
    };
    setTimeout(startNextCaller, config.workerWarmUpDelayMS);
  },
};
