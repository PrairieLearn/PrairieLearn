const os = require('os');
const path = require('path');
const uuidv4 = require('uuid/v4');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('./logger');
const config = require('./config');
const load = require('./load');
const codeCaller = require('./code-caller');

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

let pythonCallers = []; // all pythonCallers, whether available for work or currently busy
let availablePythonCallers = []; // FIFO queue for available pythonCallers waiting for a job/callback
let waitingCallbacks = []; // FIFO queue for jobs/callbacks waiting for an available pythonCaller

module.exports = {
    init() {
        debug('init()');
        if (!config.useWorkers) {
            return;
        }
        var numWorkers = config.workersCount;
        if (numWorkers == null) {
            numWorkers = Math.ceil(config.workersPerCpu * os.cpus().length);
        }
        for (let i = 0; i < numWorkers; i++) {
            const pc = new codeCaller.PythonCaller();
            pc.number = i;
            pythonCallers.push(pc);
            load.startJob('python_worker_idle', pc.uuid);
            availablePythonCallers.push(pc);
        }
        module.exports._warmUpWorkers();
    },

    finish(callback) {
        debug('finish()');
        if (!config.useWorkers) {
            callback(null);
            return;
        }
        const testFinished = () => {
            if (availablePythonCallers.length < pythonCallers.length) {
                // keep waiting for all pythonCallers to be returned
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

    getPythonCaller(callback) {
        debug('getPythonCaller()');
        if (!config.useWorkers) {
            const pc = new codeCaller.PythonCaller();
            load.startJob('python_worker_active', pc.uuid);
            callback(null, pc);
            return;
        }
        if (pythonCallers.length == 0) return callback(new Error('no PythonCallers initialized'));
        if (availablePythonCallers.length > 0) {
            const pc = availablePythonCallers[0];
            availablePythonCallers = availablePythonCallers.slice(1);
            load.endJob('python_worker_idle', pc.uuid);
            debug(`getPythonCaller(): got ${pc.number}`);
            load.startJob('python_worker_active', pc.uuid);
            callback(null, pc);
        } else {
            debug(`getPythonCaller(): adding to waitingCallbacks`);
            callback.__load_uuid = uuidv4();
            load.startJob('python_callback_waiting', callback.__load_uuid);
            waitingCallbacks.push(callback);
        }
    },

    returnPythonCaller(pc, callback) {
        debug('returnPythonCaller()');
        load.endJob('python_worker_active', pc.uuid);
        if (!config.useWorkers) {
            pc.done();
            callback(null);
            return;
        }
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
                debug('returnPythonCaller(): making new pythonCaller');
                pc = new codeCaller.PythonCaller();
                pc.number = i;
                pythonCallers[i] = pc;
            }
            // by this point either the restart succeeded or we have a brand new PythonCaller
            if (waitingCallbacks.length > 0) {
                debug('returnPythonCaller(): passing to a waiting callback');
                const cb = waitingCallbacks[0];
                waitingCallbacks = waitingCallbacks.slice(1);
                load.endJob('python_callback_waiting', cb.__load_uuid);
                load.startJob('python_worker_active', pc.uuid);
                cb(null, pc);
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
        let iCaller = 0;

        const startNextCaller = () => {
            debug(`_warmUpWorkers(): start worker ${iCaller}`);
            // start caller number iCaller if it's available
            for (let i = 0; i < availablePythonCallers.length; i++) {
                if (availablePythonCallers[i].number == iCaller) {
                    debug(`_warmUpWorkers(): running availablePythonCallers[${i}].ensureChild() for worker number ${availablePythonCallers[i].number}`);
                    availablePythonCallers[i].ensureChild();
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
