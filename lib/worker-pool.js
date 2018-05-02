const ERR = require('async-stacktrace');
const _ = require('lodash');
const child_process = require('child_process');
const async = require('async');
const uuidv4 = require('uuid/v4');

const config = require('./config');
const logger = require('./logger');

// all the current workers, indexed 0...(n-1)
const workers = [];

// the current calls, indexed by UUID
const calls = {};
/*
  calls[id] has format:
      {
          callback,    // the callback(err, args) to call when the worker function returns
          id,          // id of the call
          started_at,  // timestamp when started
          fcn,         // the function to call in the worker
          args,        // the args object for the worker function
      }
*/

// the worker to send the next call to, will be round-robined
let currentWorker = 0;

/*
  messages from manager to workers look like {id, fcn, args}
  messages from worker to manager look like {id, err, args}
*/

module.exports = {
    /**
     * Initialize a pool of workers.
     * 
     * @param {number} nproc - The number of workers in the pool.
     * @param {function} callback - A callback(err) handler.
     */
    init(nproc, callback) {
        // create all the workers and set up their message handlers
        async.times(nproc, (n, callback) => {
            worker = child_process.fork(__dirname + '/worker');
            workers[n] = worker;
            worker.on('error', (err) => {
                logger.error(`ERROR: worker ${n}`, err);
                process.exit(1);
            });
            worker.on('exit', (code, signal) => {
                logger.error(`ERROR: worker ${n} exited`, {code, error});
                process.exit(1);
            });
            worker.on('message', (message) => {
                if (!_.has(calls, message.id)) {
                    logger.error('ERROR: message from non-existent worker call', message);
                    return;
                }
                calls[message.id].callback(message.err, message.args);
                delete calls[message.id];
            });
            callback(null);
        }, (err) => {
            if (ERR(err, callback)) return;

            // call the special function 'init' on each worker explicitly
            async.times(nproc, (n, callback) => {
                const id = uuidv4();
                const fcn = 'init';
                const args = {n, config};
                calls[id] = {callback, id, started_at: Date.now(), fcn, args};
                workers[n].send({id, fcn, args}, (err) => {
                    if (ERR(err, callback)) return;
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    /**
     * Call a function in a worker.
     * 
     * @param {string} fcn - The function name to call.
     * @param {object} args - Argument object for the function.
     * @param {function} callback - A callback(err, arg) that will be called with the return value of the worker function.
     */
    call(fcn, args, callback) {
        const id = uuidv4();
        calls[id] = {callback, id, started_at: Date.now(), fcn, args};
        workers[currentWorker].send({id, fcn, args}, (err) => {
            if (ERR(err, callback)) return;
        });
        currentWorker = (currentWorker + 1) % workers.length;
    },
};
