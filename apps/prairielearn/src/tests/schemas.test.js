const Ajv = require('ajv').default;
const assert = require('chai').assert;
const schemas = require('../schemas');

const isObject = (a) => !!a && a.constructor === Object;

const validateRequired = (obj) => {
  const errors = validateRequiredRecursive(obj);
  if (errors.length === 0) return null;
  return errors;
};

const validateRequiredRecursive = (obj, path = '') => {
  if (!isObject(obj)) return [];
  let errors = [];
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
  describe(`${schemaName} schema`, () => {
    const schema = schemas[schemaName];
    it('compiles', () => {
      const ajv = new Ajv();
      const validate = ajv.compile(schema);
      assert.isFunction(validate);
    });

    it('validates', () => {
      const ajv = new Ajv();
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
