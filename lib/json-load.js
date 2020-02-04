const ERR = require('async-stacktrace');
const util = require('util');
const fs = require('fs');
const _ = require('lodash');
const jju = require('jju');
const Ajv = require('ajv');

const logger = require('./logger');

// We use a single global instance so that schemas aren't recompiled every time they're used
const ajv = new Ajv({ schemaId: 'auto' });
ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));

/**
 * Asynchronously reads the specified JSON file.
 * 
 * @param jsonFilename {string} The name of the file to read
 * @param callback {Function} Invoked with the resolved JSON data or an error
 * @returns {void}
 */
module.exports.readJSON = function(jsonFilename, callback) {
    fs.readFile(jsonFilename, {encoding: 'utf8'}, function(err, data) {
        if (ERR(err, callback)) return;
        let json;
        try {
            json = jju.parse(data, {mode: 'json'});
        } catch (e) {
            ERR(new Error(`Error in JSON file format: ${jsonFilename} (line ${e.row}, column ${e.column})\n${e.name}: ${e.message}`), callback);
            return;
        }
        callback(null, json);
    });
};
module.exports.readJSONAsync = util.promisify(module.exports.readJSON);

/**
 * Validates an object with the specified JSON schema.
 * 
 * @param json {Object} The object to validate
 * @param schema {Object} The schema used to validate the object
 * @param callback {Function} Invoked with the original JSON data or an error
 * @returns {void}
 */
module.exports.validateJSON = function(json, schema, callback) {
    let valid;
    let validate;
    try {
        validate = ajv.compile(schema);
        valid = validate(json);
    } catch (e) {
        callback(e);
        return;
    }
    if (!valid) {
        callback(new Error(`Error in JSON file: ${ajv.errorsText(validate.errors)}`));
    } else {
        callback(null, json);
    }
};
module.exports.validateJSONAsync = util.promisify(module.exports.validateJSON);

/**
 * Synchronously reads the specified JSON file and validates it against a
 * schema. If there are any failures, it exits the process with a non-zero
 * exit code.
 * 
 * @param {string} jsonFilename The name of the file to read
 * @param {Object} schema The schema used to validate the JSON file
 */
module.exports.readJSONSyncOrDie = function(jsonFilename, schema) {
    try {
        var data = fs.readFileSync(jsonFilename, {encoding: 'utf8'});
    } catch (e) {
        logger.error(`Error reading JSON file: ${jsonFilename}`, e);
        process.exit(1);
        return;
    }
    try {
        var json = jju.parse(data, {mode: 'json'});
    } catch (e) {
        logger.error(`Error in JSON file format: ${jsonFilename} (line ${e.row}, column ${e.column})\n${e.name}: ${e.message}`);
        process.exit(1);
        return;
    }
    if (schema) {
        try {
            const validate = ajv.compile(schema);
            const valid = validate(json);
            if (!valid) {
                logger.error(`Error in JSON file: ${ajv.errorsText(validate.errors)}`);
                process.exit(1);
                return;
            } else {
                return json;
            }
        } catch (e) {
            logger.error('Error validating JSON', e);
            process.exit(1);
            return;
        }
    }
    return json;
};

/**
 * Reads and validates some type of `info.json` file.
 * 
 * @param {string} jsonFilename The name of the file to read
 * @param {Object} schema The name of the schema file
 * @param {Function} callback Invoked with the validated JSON or an error
 * @returns {void}
 */
module.exports.readInfoJSON = function(jsonFilename, schema, callback) {
    module.exports.readJSON(jsonFilename, function(err, json) {
        if (err) {
            callback(err);
            return;
        }
        if (schema) {
            module.exports.validateJSON(json, schema, function(err, json) {
                if (err) {
                    ERR(new Error('Error validating file \'' + jsonFilename + '\' against schema: ' + err), callback);
                    return;
                }
                json.jsonFilename = jsonFilename;
                callback(null, json);
            });
        } else {
            callback(null, json);
            return;
        }
    });
};
module.exports.readInfoJSONAsync = util.promisify(module.exports.readInfoJSON);

/**
 * Validates the `options` property of an object against a particular schema
 * based on the `type` of the object. For example, given an `optionsSchemaPrefix`
 * of `foo`, an object with type `Bar` would attemt to be validated against the
 * `schemas.fooBar` schema.
 * 
 * @param {Object} json The object to validate
 * @param {string} jsonFilename The filename of the original JSON file, for context in errors
 * @param {string} optionsSchemaPrefix The prefix of the schema name
 * @param {Object} schemas The set of schemas to select from
 */
module.exports.validateOptions = function(json, jsonFilename, optionsSchemaPrefix, schemas, callback) {
    if (optionsSchemaPrefix && _(json).has('type') && _(json).has('options')) {
        const schema = schemas[optionsSchemaPrefix + json.type];
        if (!schema) {
            callback(new Error(`Could not find options schema for type ${json.type}`));
            return;
        }
        module.exports.validateJSON(json.options, schema, function(err) {
            if (err) {
                callback(new Error('Error validating \'options\' field from \'' + jsonFilename + '\' against schema: ' + err));
                return;
            }
            if (json.uuid) json.uuid = json.uuid.toLowerCase();
            callback(null, json);
        });
    } else {
        return callback(null, json);
    }
};
module.exports.validateOptionsAsync = util.promisify(module.exports.validateOptions);
