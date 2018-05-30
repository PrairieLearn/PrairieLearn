const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const codeCaller = require('./code-caller');

let pythonCaller = null;

module.exports = {
    init() {
        debug('initializing');

        pythonCaller = new codeCaller.PythonCaller();
    },

    finish(callback) {
        debug('finishing');

        if (pythonCaller == null) return callback(new Error('no available PythonCaller to finish'));
        pythonCaller.done();
        pythonCaller = null;
        callback(null);

        // callback(null);
    },

    getPythonCaller(callback) {
        debug('getPythonCaller()');

        if (pythonCaller == null) return callback(new Error('no available PythonCaller'));
        const pc = pythonCaller;
        pythonCaller = null;
        callback(null, pc);

        // callback(null, new codeCaller.PythonCaller());
    },

    returnPythonCaller(pc, callback) {
        debug('returnPythonCaller()');

        if (pythonCaller != null) return callback(new Error(`can't return PythonCaller, already have one`));
        pythonCaller = pc;
        callback(null);

        // pc.done();
        // callback(null);
    },
};
