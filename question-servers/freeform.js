var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var error = require('../lib/error');
var logger = require('../lib/logger');
var filePaths = require('../lib/file-paths');
var questionHelper = require('../lib/questionHelper.js');

module.exports = {
    renderExtraHeaders: function(question, course, locals, callback) {
        callback(null, '');
    },

    renderQuestion: function(variant, question, submission, course, locals, callback) {
        callback(null, "");
    },

    renderSubmission: function(variant, question, submission, course, locals, callback) {
        callback(null, "");
    },

    renderTrueAnswer: function(variant, question, course, locals, callback) {
        callback(null, "");
    },

    execPythonServer: function(pythonCmd, pythonArgs, question, course, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);
        var serverFilename = path.join(question_dir, 'server.py');

        var callData = {pythonCmd, pythonArgs, question, course};

        var cmdInput = {
            cmd: pythonCmd,
            args: pythonArgs,
            question_dir: question_dir,
        };
        try {
            var input = JSON.stringify(cmdInput);
        } catch (e) {
            var err = new Error('Error encoding question JSON');
            err.data = {endcodeMsg: e.message, callData};
            return ERR(err, callback);
        }
        var cmdOptions = {
            cwd: question_dir,
            input: input,
            timeout: 10000, // milliseconds
            killSignal: 'SIGKILL',
        };
        var cmd = 'python';
        var args = [__dirname + '/python_caller.py'];
        var child = child_process.spawn(cmd, args, cmdOptions);

        var outputStdout = '';
        var outputStderr = '';

        child.stdout.on('data', (data) => {
            outputStdout += data;
        });
        
        child.stderr.on('data', (data) => {
            outputStderr += data;
        });
        
        child.on('close', (code) => {
            if (code) {
                var err = new Error('Error in question code execution');
                err.data = {code, callData, outputStdout, outputStderr};
                return ERR(err, callback);
            }
            try {
                var output = JSON.parse(outputStdout);
            } catch (e) {
                var err = new Error('Error decoding question JSON');
                err.data = {decodeMsg: e.message, callData, outputStdout, outputStderr};
                return ERR(err, callback);
            }
            callback(null, output);
        });
        
        child.on('error', (err) => {
            var err = new Error('Error executing python question code');
            err.data = {execMsg: err.message, callData};
            return ERR(err, callback);
        });

        child.stdin.write(input);
        child.stdin.end();
    },

    getData: function(question, course, variant_seed, callback) {
        var question_dir = path.join(course.path, 'questions', question.directory);

        var pythonArgs = {
            variant_seed: variant_seed,
            options: _.defaults({}, course.options, question.options),
            question_dir: question_dir,
        };
        this.execPythonServer('get_data', pythonArgs, question, course, (err, result) => {
            if (ERR(err, callback)) return;
            _.defaults(result.options, course.options, question.options);
            callback(null, result);
        });
    },

    getFile: function(filename, variant, question, course, callback) {
        callback(new Error('not implemented'));
    },

    gradeSubmission: function(submission, variant, question, course, callback) {
        callback(new Error('not implemented'));
    },
};
