// @ts-check
const ERR = require('async-stacktrace');
const util = require('util');
const fs = require('fs');
const jju = require('jju');
const Ajv = require('ajv').default;

// We use a single global instance so that schemas aren't recompiled every time they're used
const ajv = new Ajv();

/**
 * Asynchronously reads the specified JSON file.
 *
 * @param {string} jsonFilename The name of the file to read
 * @param {(err: Error | null, data?: any) => void} callback Invoked with the resolved JSON data or an error
 */
module.exports.readJSON = function (jsonFilename, callback) {
  fs.readFile(jsonFilename, { encoding: 'utf8' }, function (err, data) {
    if (ERR(err, callback)) return;
    let json;
    try {
      json = jju.parse(data, { mode: 'json' });
    } catch (e) {
      ERR(
        new Error(
          `Error in JSON file format: ${jsonFilename} (line ${e.row}, column ${e.column})\n${e.name}: ${e.message}`,
        ),
        callback,
      );
      return;
    }
    callback(null, json);
  });
};
module.exports.readJSONAsync = util.promisify(module.exports.readJSON);

/**
 * Validates an object with the specified JSON schema.
 *
 * @param {object} json The object to validate
 * @param {object} schema The schema used to validate the object
 * @param {(err: Error | null, json?: any) => void} callback Invoked with the original JSON data or an error
 */
module.exports.validateJSON = function (json, schema, callback) {
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
    callback(
      new Error(
        `JSON validation error: ${ajv.errorsText(
          validate.errors,
        )}\nError details:\n${JSON.stringify(validate.errors, null, 2)}`,
      ),
    );
  } else {
    callback(null, json);
  }
};

/**
 * Validates an object with the specified JSON schema.
 *
 * @param {object} json The object to validate
 * @param {object} schema The schema used to validate the object
 * @returns {Promise<any>} The original JSON, if valid
 */
module.exports.validateJSONAsync = util.promisify(module.exports.validateJSON);

/**
 * Reads and validates some type of `info.json` file.
 *
 * @param {string} jsonFilename The name of the file to read
 * @param {Object} schema The name of the schema file
 * @param {(err: Error | null, json?: any) => void} callback Invoked with the validated JSON or an error
 */
module.exports.readInfoJSON = function (jsonFilename, schema, callback) {
  module.exports.readJSON(jsonFilename, function (err, json) {
    if (err) {
      callback(err);
      return;
    }
    if (schema) {
      module.exports.validateJSON(json, schema, function (err, json) {
        if (err) {
          ERR(
            new Error("Error validating file '" + jsonFilename + "' against schema: " + err),
            callback,
          );
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
