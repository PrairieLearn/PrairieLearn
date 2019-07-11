module.exports = {};

module.exports.getAttrib = function(element, name, defaultValue) {
    if (!Object.prototype.hasOwnProperty.call(element.attribs, name)) {
        if (defaultValue === undefined) {
            throw new Error('element does not have attribute "' + name + '" and no default value is provided');
        }
        return defaultValue;
    }
    return element.attribs[name];
};

module.exports.getBooleanAttrib = function(element, name, defaultValue) {
    const trueValues = [true, 'true', 't', '1', 'True', 'T', 'TRUE', 'yes', 'y', 'Yes', 'Y', 'YES'];
    const falseValues = [false, 'false', 'f', '0', 'False', 'F', 'FALSE', 'no', 'n', 'No', 'N', 'NO'];
    
    if (!Object.prototype.hasOwnProperty.call(element.attribs, name)) {
        if (defaultValue === undefined) {
            throw new Error('element does not have attribute "' + name + '" and no default value is provided');
        }
        return defaultValue;
    }
    const val = element.attribs[name];
    if (trueValues.includes(val)) {
        return true;
    } else if (falseValues.includes(val)) {
        return false;
    } else {
        throw new Error('invalid value for boolean attribute "' + name + '": "' + val + '"');
    }
};

module.exports.getNumberAttrib = function(element, name, defaultValue) {
    if (!Object.prototype.hasOwnProperty.call(element.attribs, name)) {
        if (defaultValue === undefined) {
            throw new Error('element does not have attribute "' + name + '" and no default value is provided');
        }
        return defaultValue;
    }
    const val = element.attribs[name];
    const numVal = Number.parseFloat(val);
    if (!Number.isFinite(numVal)) throw new Error('invalid value for number attribute "' + name + '": "' + val + '"');
    return numVal;
};

module.exports.getIntegerAttrib = function(element, name, defaultValue) {
    if (!Object.prototype.hasOwnProperty.call(element.attribs, name)) {
        if (defaultValue === undefined) {
            throw new Error('element does not have attribute "' + name + '" and no default value is provided');
        }
        return defaultValue;
    }
    const val = element.attribs[name];
    const numVal = Number.parseInt(val);
    if (!Number.isFinite(numVal)) throw new Error('invalid value for number attribute "' + name + '": "' + val + '"');
    return numVal;
};
