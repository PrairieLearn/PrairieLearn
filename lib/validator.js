var fs = require("fs");
var _ = require("lodash");
var validator = require('is-my-json-valid')
var path = require('path');

module.exports.validateFromFile = function(data, schemaFilename, callback) {
    if (schemaFilename) {
        const absSchemaFilename = path.join(__dirname, '..', schemaFilename);
        fs.readFile(absSchemaFilename, {encoding: 'utf-8'}, (err, data) => {
            if (err) return callback(err)
            var validate
            try {
                validate = validator(data, {verbose: true, greedy: true})
            } catch (e) {
                return callback(e)
            }
            validate(data)
            if (validate.errors) {
                return callback("Invalid data: "
                                + _(configValidate.errors).map(function(e) {
                                    return 'Error in field "' + e.field + '": ' + e.message
                                        + (_(e).has('value') ? (' (value: ' + jju.stringify(e.value) + ')') : '');
                                }).join('; '));
            }
            callback(null, data)
        })
    } else {
        callback(new Error("Schema filename was not specified"))
    }
}
