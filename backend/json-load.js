var fs = require("fs");
var _ = require("underscore");
var jju = require('jju');
var validator = require('is-my-json-valid')

var logger = require("./logger");

module.exports.readJSON = function(jsonFilename, callback) {
    var json;
    fs.readFile(jsonFilename, {encoding: 'utf8'}, function(err, data) {
        if (err) {
            return callback("Error reading JSON file: " + jsonFilename + ": " + err);
        }
        try {
            json = jju.parse(data, {mode: 'json'});
        } catch (e) {
            return callback("Error in JSON file format: " + jsonFilename + " (line " + e.row + ", column " + e.column + ")\n"
                            + e.name + ": " + e.message);
        }
        callback(null, json);
    });
};

module.exports.validateJSON = function(json, schema, callback) {
    var configValidate;
    try {
        configValidate = validator(schema, {verbose: true, greedy: true});
    } catch (e) {
        return callback("Error loading JSON schema file: " + schemaFilename + ": " + e);
    }
    configValidate(json);
    if (configValidate.errors) {
        return callback("Error in JSON file specification: "
                        + _(configValidate.errors).map(function(e) {
                            return 'Error in field "' + e.field + '": ' + e.message
                                + (_(e).has('value') ? (' (value: ' + jju.stringify(e.value) + ')') : '');
                        }).join('; '));
    }
    callback(null, json);
};

module.exports.readJSONSyncOrDie = function(jsonFilename, schemaFilename) {
    try {
        var data = fs.readFileSync(jsonFilename, {encoding: 'utf8'});
    } catch (e) {
        logger.error("Error reading JSON file: " + jsonFilename, e);
        process.exit(1);
    }
    try {
        var json = jju.parse(data, {mode: 'json'});
    } catch (e) {
        logger.error("Error in JSON file format: " + jsonFilename + " (line " + e.row + ", column " + e.column + ")\n"
                     + e.name + ": " + e.message);
        process.exit(1);
    }
    if (schemaFilename) {
        configValidate = validator(fs.readFileSync(schemaFilename, {encoding: 'utf8'}),
                                   {verbose: true, greedy: true});
        configValidate(json);
        if (configValidate.errors) {
            logger.error("Error in JSON file specification: " + jsonFilename);
            _(configValidate.errors).forEach(function(e) {
                logger.error('Error in field "' + e.field + '": ' + e.message
                            + (_(e).has('value') ? (' (value: ' + e.value + ')') : ''));
            });
            process.exit(1);
        }
    }
    return json;
};

module.exports.readInfoJSON = function(jsonFilename, schemaFilename, optionsSchemaPrefix, optionsSchemaSuffix, callback) {
    var that = this;
    that.readJSON(jsonFilename, function(err, json) {
        if (err) return callback(err);
        if (schemaFilename) {
            that.readJSON(schemaFilename, function(err, schema) {
                if (err) return callback(err);
                that.validateJSON(json, schema, function(err, json) {
                    if (err) return callback("Error validating file '" + jsonFilename + "' against '" + schemaFilename + "': " + err);
                    if (optionsSchemaPrefix && optionsSchemaSuffix && _(json).has('type') && _(json).has('options')) {
                        var optionsSchemaFilename = optionsSchemaPrefix + json.type + optionsSchemaSuffix;
                        that.readJSON(optionsSchemaFilename, function(err, optionsSchema) {
                            if (err) return callback(err);
                            that.validateJSON(json.options, optionsSchema, function(err, optionsJSON) {
                                if (err) return callback("Error validating 'options' field from '" + jsonFilename + "' against '" + optionsSchemaFilename + "': " + err);
                                callback(null, json);
                            });
                        });
                    } else {
                        return callback(null, json);
                    }
                });
            });
        } else {
            return callback(null, json);
        }
    });
};
