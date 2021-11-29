const config = require('./config');

module.exports.isEnterprise = function isEnterprise() {
  return config.isEnterprise ?? false;
};
