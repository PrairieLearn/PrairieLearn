// @ts-check
const ERR = require('async-stacktrace');
import * as util from 'util';
import * as fs from 'fs/promises';
import * as jju from 'jju';
import Ajv from 'ajv';

// We use a single global instance so that schemas aren't recompiled every time they're used
const ajv = new Ajv();

/**
 * Asynchronously reads the specified JSON file.
 *
 * @param {string} jsonFilename The name of the file to read
 * @returns {Promise<any>} The parsed JSON
 */
export async function readJSON(jsonFilename) {
  const data = await fs.readFile(jsonFilename, { encoding: 'utf8' });
  try {
    return jju.parse(data, { mode: 'json' });
  } catch (e) {
    throw new Error(
      `Error in JSON file format: ${jsonFilename} (line ${e.row}, column ${e.column})\n${e.name}: ${e.message}`,
    );
  }
}

/**
 * Validates an object with the specified JSON schema.
 *
 * @param {object} json The object to validate
 * @param {object} schema The schema used to validate the object
 * @param {(err: Error | null, json?: any) => void} callback Invoked with the original JSON data or an error
 */
export function validateJSON(json, schema, callback) {
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
}

/**
 * Validates an object with the specified JSON schema.
 *
 * @param {object} json The object to validate
 * @param {object} schema The schema used to validate the object
 * @returns {Promise<any>} The original JSON, if valid
 */
export const validateJSONAsync = util.promisify(validateJSON);

/**
 * Reads and validates some type of `info.json` file.
 *
 * @param {string} jsonFilename The name of the file to read
 * @param {Object} schema The name of the schema file
 * @param {(err: Error | null, json?: any) => void} callback Invoked with the validated JSON or an error
 */
export function readInfoJSON(jsonFilename, schema, callback) {
  readJSON(jsonFilename, function (err, json) {
    if (err) {
      callback(err);
      return;
    }
    if (schema) {
      validateJSON(json, schema, function (err, json) {
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
}
export const readInfoJSONAsync = util.promisify(readInfoJSON);
