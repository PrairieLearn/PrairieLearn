import Ajv from 'ajv';
import { assert } from 'chai';
import * as schemas from '../schemas/index.js';

const isObject = (a) => !!a && a.constructor === Object;

const validateRequired = (obj) => {
  const errors = validateRequiredRecursive(obj);
  if (errors.length === 0) return null;
  return errors;
};

const validateRequiredRecursive = (obj, path = '') => {
  if (!isObject(obj)) return [];
  let errors: string[] = [];
  if ('properties' in obj && 'required' in obj) {
    assert.isArray(obj.required);
    for (const requiredName of obj.required) {
      if (!obj.properties[requiredName]) {
        errors.push(`${path && path + '.'}properties.${requiredName}`);
      }
    }
  }
  for (const property in obj) {
    const errorsRecursive = validateRequiredRecursive(
      obj[property],
      `${path && path + '.'}${property}`,
    );
    errors = [...errors, ...errorsRecursive];
  }
  return errors;
};

for (const schemaName of Object.keys(schemas)) {
  if (schemaName === 'default') continue;

  describe(`${schemaName} schema`, () => {
    const schema = schemas[schemaName];
    it('compiles', () => {
      // https://github.com/ajv-validator/ajv/issues/2132
      const ajv = new Ajv.default();
      const validate = ajv.compile(schema);
      assert.isFunction(validate);
    });

    it('validates', () => {
      // https://github.com/ajv-validator/ajv/issues/2132
      const ajv = new Ajv.default();
      const valid = ajv.validateSchema(schema);
      if (ajv.errors) {
        console.error(ajv.errors);
      }
      assert.isTrue(valid);
    });

    it('has valid required properties', () => {
      const errors = validateRequired(schema);
      assert.isNull(errors);
    });
  });
}
