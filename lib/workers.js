const os = require('os');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('./logger');
const config = require('./config');
const codeCaller = require('./code-caller');

let pythonCallers = [], availablePythonCallers = [];
let waitingCallbacks = [];

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
            availablePythonCallers.push(pc);
        }
    },

    finish(callback) {
        debug('finish()');
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
        if (pythonCallers.length == 0) return callback(new Error('no PythonCallers'));
        if (availablePythonCallers.length > 0) {
            const pc = availablePythonCallers[0];
            availablePythonCallers = availablePythonCallers.slice(1);
            debug(`getPythonCaller(): got ${pc.number}`);
            callback(null, pc);
        } else {
            debug(`getPythonCaller(): adding to waitingCallbacks`);
            waitingCallbacks.push(callback);
        }
    },

    returnPythonCaller(pc, callback) {
        debug('returnPythonCaller()');
        callback(null);
        pc.restart((err) => {
            if (err) {
                debug('returnPythonCaller(): restart returned error: ${err}');
                logger.error(`Error restarting pythonCaller: ${err}`);
                const i = pc.number;
                pc.done();
                debug('returnPythonCaller(): making new pythonCaller');
                pc = new codeCaller.PythonCaller();
                pc.number = i;
                pythonCallers[i] = pc;
            }
            if (waitingCallbacks.length > 0) {
                debug('returnPythonCaller(): passing to a waiting callback');
                const cb = waitingCallbacks[0];
                waitingCallbacks = waitingCallbacks.slice(1);
                cb(null, pc);
            } else {
                debug('returnPythonCaller(): pushing back onto availablePythonCallers');
                availablePythonCallers.push(pc);
            }
        });
    },
};
