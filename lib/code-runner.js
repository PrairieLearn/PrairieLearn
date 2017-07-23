var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

class PythonRunner {
    constructor(workingDir, paths) {
        this.child = null;
        this.outputStdout = '';
        this.outputStderr = '';
        this.outputBoth = '';
        this.outputData = '';
    }

    run(file, fcn, args, options, callback) {
        const child = this.getChild();
        const input = JSON.stringify({
            file, fcn, args,
            cwd: options.cwd,
            paths: options.paths,
        });
        
    }

    getChild() {
        if (this.child == null) {
            const cmd = 'python3';
            const args = [__dirname + '/python_caller.py'];
            const options = {
                cwd: __dirname,
                killSignal: 'SIGKILL',
                stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, and an extra one for data
            };
            this.child = child_process.spawn(cmd, args, options);

            this.child.stderr.setEncoding('utf8');
            this.child.stdout.setEncoding('utf8');
            this.child.stdio[3].setEncoding('utf8');

            this.child.stderr.on FIXME FIXME FIXME




        child.stdout.on('data', (data) => {
            outputStdout += data;
            outputBoth += data;

            // Temporary fix to write stderr to console while waiting for this
            // to be displayed in browser
            /* eslint-disable no-console */
            console.log('FIXME');
            console.log(data);
            /* eslint-enable no-console */
        });

        child.stderr.on('data', (data) => {
            outputStderr += data;
            outputBoth += data;

            // Temporary fix to write stderr to console while waiting for this
            // to be displayed in browser
            /* eslint-disable no-console */
            console.log('FIXME');
            console.log(data);
            /* eslint-enable no-console */
        });

        child.stdio[3].on('data', (data) => {
            outputData += data;
        });

        var callbackCalled = false;

        child.on('close', (code) => {
            let err, output;
            if (code) {
                err = new Error('Error in question code execution');
                err.data = {code, cmdInput, outputStdout, outputStderr, outputBoth, outputData};
                if (!callbackCalled) {
                    callbackCalled = true;
                    return ERR(err, callback);
                } else {
                    // FIXME: silently swallowing the error here
                    return;
                }
            }
            try {
                output = JSON.parse(outputData);
            } catch (e) {
                err = new Error('Error decoding question JSON: ' + e.message);
                err.data = {decodeMsg: e.message, cmdInput, outputStdout, outputStderr, outputBoth, outputData};
                if (!callbackCalled) {
                    callbackCalled = true;
                    return ERR(err, callback);
                } else {
                    // FIXME: silently swallowing the error here
                    return;
                }
            }
            if (!callbackCalled) {
                callbackCalled = true;
                callback(null, output, outputBoth);
            } else {
                // FIXME: silently swallowing the output here
                return;
            }
        });

        child.on('error', (error) => {
            let err = new Error('Error executing python question code: ' + error.message);
            err.data = {execMsg: error.message, cmdInput, outputStdout, outputStderr, outputBoth};
            if (!callbackCalled) {
                callbackCalled = true;
                return ERR(err, callback);
            } else {
                // FIXME: silently swallowing the error here
                return;
            }
        });

        child.stdin.write(input);
        child.stdin.end();






            
        }
        return this.child;
    }

    close() {
    }
}

module.exports.PythonRunner = PythonRunner;
