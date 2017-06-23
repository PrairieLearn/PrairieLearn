const _ = require('lodash');

module.exports = {};

module.exports.getAttrib = function(element, name, defaultValue) {
    if (!_.has(element.attribs, name)) {
        if (typeof defaultValue == 'undefined') {
            throw new Error('element does not have attribute "' + name + '" and no default value is provided');
        }
        return defaultValue;
    }
    return element.attribs[name];
};

module.exports.getBooleanAttrib = function(element, name, defaultValue) {
    const val = this.getAttrib(element, name, defaultValue);
    if (_.includes([true, 'true', 't', '1', 'True', 'T', 'TRUE', 'yes', 'y', 'Yes', 'Y', 'YES'], val)) {
        return true;
    } else if (_.includes([false, 'false', 'f', '0', 'False', 'F', 'FALSE', 'no', 'n', 'No', 'N', 'NO'], val)) {
        return false;
    } else {
        throw new Error('invalid value for boolean attribute "' + name + '": "' + val + '"');
    }
};
