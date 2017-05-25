const _ = require('lodash');

module.exports = {
    make: function(status, message, data) {
        var err = new Error(message);
        err.status = status;
        err.data = data;
        return err;
    },

    makeWithData: function(message, data) {
        var err = new Error(message);
        err.data = data;
        return err;
    },

    addData: function(err, data) {
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

    newMessage: function(err, newMsg) {
        var newErr;
        if (_(err).isError()) {
            newErr = err;
        } else {
            newErr = new Error(String(err));
        }
        newErr.data = newErr.data || {};
        newErr.prevMessages = newErr.prevMsgs || [];
        newErr.prevMessages.splice(0, 0, newErr.message);
        newErr.message = newMsg;
        return newErr;
    },
};
