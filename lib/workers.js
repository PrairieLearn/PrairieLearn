const os = require('os');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const codeCaller = require('./code-caller');

let pythonCallers = [], availablePythonCallers = [];
let waitingCallbacks = [];

module.exports = {
    init() {
        debug('initializing');
        for (let i = 0; i < os.cpus().length; i++) {
            const pc = new codeCaller.PythonCaller();
            pythonCallers.push(pc);
            availablePythonCallers.push(pc);
        }
    },

    finish(callback) {
        debug('finishing');
        const testFinished = () => {
            if (availablePythonCallers.length < pythonCallers.length) {
                // keep waiting for all pythonCallers to be returned
                setTimeout(testFinished, 100);
            } else {
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
            const pc = availablePythonCallers.pop();
            callback(null, pc);
        } else {
            waitingCallbacks.push(callback);
        }
    },

    returnPythonCaller(pc, callback) {
        debug('returnPythonCaller()');
        callback(null);
        if (waitingCallbacks.length > 0) {
            cb = waitingCallbacks[0];
            waitingCallbacks = waitingCallbacks.slice(1);
            cb(null, pc);
        } else {
            availablePythonCallers.push(pc);
        }
    },
};
