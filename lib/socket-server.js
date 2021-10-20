const ERR = require('async-stacktrace');
const { Server } = require('socket.io');
const redis = require('redis');
const redisAdapter = require('socket.io-redis');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('./config');

module.exports = {};

module.exports.init = function (server, callback) {
  debug('init(): creating socket server');
  module.exports.io = new Server(server);
  if (config.redisUrl) {
    // Use redis to mirror broadcasts via all servers
    debug('init(): initializing redis pub/sub clients');
    module.exports.pub = redis.createClient(config.redisUrl);
    module.exports.sub = redis.createClient(config.redisUrl);
    debug('init(): initializing redis socket adapter');
    module.exports.io.adapter(
      redisAdapter({
        pubClient: module.exports.pub,
        subClient: module.exports.sub,
      })
    );
  }
  callback(null);
};

module.exports.close = function (callback) {
  if (!config.redisUrl) return callback(null);

  debug('close(): quitting redis pub client');
  module.exports.pub.quit((err) => {
    if (ERR(err, callback)) return;
    debug('close(): quitting redis sub client');
    module.exports.sub.quit((err) => {
      if (ERR(err, callback)) return;

      debug('close(): closing socket server');
      // This call to close() will fail because io.engine is
      //undefined. The API docs seem to indicate that we should
      //call close(), but for now we just skip it.
      //module.exports.io.close(err => {
      //if (ERR(err, callback)) return;

      debug('close(): completed socket server shutdown');
      callback(null);
      //});
    });
  });
};
