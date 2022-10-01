const { Server } = require('socket.io');
const redis = require('redis');
const redisAdapter = require('socket.io-redis');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('./config');
const { promisify } = require('util');

module.exports.init = function (server) {
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
};

module.exports.close = async function () {
  await promisify(module.exports.io.close.bind(module.exports.io))();

  if (config.redisUrl) {
    await promisify(module.exports.pub.quit.bind(module.exports.pub))();
    await promisify(module.exports.sub.quit.bind(module.exports.sub))();
  }
};
