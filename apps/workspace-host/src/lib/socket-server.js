// @ts-check
const { Emitter } = require('@socket.io/redis-emitter');
const { Redis } = require('ioredis');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { config } = require('./config');

module.exports.init = async function () {
  debug('init(): creating socket emitter');
  module.exports.client = new Redis(config.redisUrl);
  module.exports.io = new Emitter(module.exports.client);
};

module.exports.close = async function () {
  await module.exports.client?.quit();
};
