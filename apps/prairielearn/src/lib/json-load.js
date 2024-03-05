// @ts-check
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
 */
export function validateJSON(json, schema) {
  const validate = ajv.compile(schema);
  const valid = validate(json);

  if (!valid) {
    throw new Error(
      `JSON validation error: ${ajv.errorsText(validate.errors)}\nError details:\n${JSON.stringify(
        validate.errors,
        null,
        2,
      )}`,
    );
  }
}

/**
 * Reads and validates some type of `info.json` file.
 *
 * @param {string} jsonFilename The name of the file to read
 * @param {Object} schema The name of the schema file
 * @returns {Promise<any>} The parsed and validated JSON
 */
export async function readInfoJSON(jsonFilename, schema) {
  const json = await readJSON(jsonFilename);

  if (!schema) return json;

  try {
    validateJSON(json, schema);
    return json;
  } catch (e) {
    throw new Error(`Error validating file '${jsonFilename}' against schema: ${e}`);
  }
}
