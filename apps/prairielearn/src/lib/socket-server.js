// @ts-check
const { Server } = require('socket.io');
const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { config } = require('./config');

module.exports.init = async function (server) {
  debug('init(): creating socket server');
  module.exports.io = new Server(server);
  if (config.redisUrl) {
    // Use redis to mirror broadcasts via all servers
    debug('init(): initializing redis pub/sub clients');
    module.exports.pub = redis.createClient({ url: config.redisUrl });
    module.exports.sub = redis.createClient({ url: config.redisUrl });
    await Promise.all([module.exports.pub.connect(), module.exports.sub.connect()]);
    debug('init(): initializing redis socket adapter');
    module.exports.io.adapter(createAdapter(module.exports.pub, module.exports.sub));
  }
};

module.exports.close = async function () {
  if (config.redisUrl) {
    await Promise.all([module.exports.pub.quit(), module.exports.sub.quit()]);
  }

  // Note that we don't use `io.close()` here, as that actually tries to close
  // the underlying HTTP server. In our desired shutdown sequence, we first
  // close the HTTP server and then later disconnect all sockets. There's some
  // discussion about this behavior here:
  // https://github.com/socketio/socket.io/discussions/4002#discussioncomment-4080748
  //
  // Note the use of `io.local`, which prevents the server from attempting to
  // broadcast the disconnect to other servers via Redis.
  module.exports.io.local.disconnectSockets(true);
};
