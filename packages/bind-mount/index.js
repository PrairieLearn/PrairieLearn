const addon = require('bindings')('addon');

module.exports.mount = addon.Mount;
module.exports.unmount = addon.Unmount;
