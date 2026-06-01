import { Ajv } from 'ajv';
import { assert, describe, it } from 'vitest';

import { ajvSchemas } from '../schemas/index.js';
import { AssessmentJsonSchema } from '../schemas/infoAssessment.js';

const isObject = (a: any) => !!a && a.constructor === Object;

const validateRequired = (obj: any) => {
  const errors = validateRequiredRecursive(obj);
  if (errors.length === 0) return null;
  return errors;
};

const validateRequiredRecursive = (obj: any, path = '') => {
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

for (const schemaName of Object.keys(ajvSchemas)) {
  if (schemaName === 'default') continue;

  describe(`${schemaName} schema`, () => {
    const schema = ajvSchemas[schemaName as keyof typeof ajvSchemas];
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

describe('infoAssessment Zod schema', () => {
  it('preserves omitted point fields', () => {
    const result = AssessmentJsonSchema.parse({
      uuid: '00000000-0000-4000-8000-000000000000',
      type: 'Homework',
      title: 'Homework 1',
      set: 'Homework',
      number: '1',
      zones: [{ questions: [{ id: 'q1', points: 5 }] }],
    });

    assert.equal(result.zones[0].questions[0].points, 5);
    assert.notProperty(result.zones[0].questions[0], 'autoPoints');
  });

  it('allows partial assessment tool maps', () => {
    const result = AssessmentJsonSchema.safeParse({
      uuid: '00000000-0000-4000-8000-000000000000',
      type: 'Homework',
      title: 'Homework 1',
      set: 'Homework',
      number: '1',
      tools: {},
      zones: [{ questions: [{ id: 'q1', points: 5 }], tools: {} }],
    });

    assert.isTrue(result.success);
  });

  it('does not deprecate zone and question permissions in JSON Schema', () => {
    const root = ajvSchemas.infoAssessment;
    const resolveRef = (node: any) =>
      node && typeof node.$ref === 'string'
        ? root.definitions[node.$ref.replace('#/definitions/', '')]
        : node;

    const zone = resolveRef(root.properties?.zones?.items);
    assert.isObject(zone);
    assert.notProperty(zone.properties.canView, 'deprecated');
    assert.notInclude(zone.properties.canView.description, 'DEPRECATED');

    const question = resolveRef(zone.properties.questions.items);
    assert.notProperty(question.properties.canSubmit, 'deprecated');
    assert.notInclude(question.properties.canSubmit.description, 'DEPRECATED');
  });
});
