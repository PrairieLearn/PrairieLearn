const _ = require('lodash');

module.exports = {
  /**
   *
   * @param {number} status
   * @param {string} message
   * @param {any} [data]
   * @returns
   */
  make: function (status, message, data) {
    var err = new Error(message);
    err.status = status;
    err.data = data;
    return err;
  },

  makeWithData: function (message, data) {
    var err = new Error(message);
    err.data = data;
    return err;
  },

  addData: function (err, data) {
    var newErr;
    if (_(err).isError()) {
      newErr = err;
    } else {
      newErr = new Error(String(err));
    }
    newErr.data = newErr.data || {};
    _.assign(newErr.data, data);
    return newErr;
  },

  newMessage: function (err, newMsg) {
    var newErr;
    if (_(err).isError()) {
      newErr = err;
    } else {
      newErr = new Error(String(err));
    }
    newErr.data = newErr.data || {};
    newErr.data._previousMessages = newErr.data._previousMessages || [];
    newErr.data._previousMessages.splice(0, 0, newErr.message);
    newErr.message = `${newMsg}: ${newErr.message}`;
    return newErr;
  },
};
