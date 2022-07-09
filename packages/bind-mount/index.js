try {
  const addon = require('bindings')('addon');

  module.exports.mount = (source, target) => {
    return new Promise((resolve, reject) => {
      addon.Mount(source, target, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  module.exports.unmount = (target) => {
    return new Promise((resolve, reject) => {
      addon.Unmount(target, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };
} catch (err) {
  module.exports.mount = () => {
    throw new Error('Failed to load native bindings');
  };

  module.exports.mount = () => {
    throw new Error('Failed to load native bindings');
  };
}
