_ = require('lodash');

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
            console.log("is error");
            newErr = err;
        } else {
            console.log("is not err");
            newErr = new Error(String(err));
        }
        newErr.data = newErr.data || {};
        _.assign(newErr.data, data);
        return newErr;
    },
};
