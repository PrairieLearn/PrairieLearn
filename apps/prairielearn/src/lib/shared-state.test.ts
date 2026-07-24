import { assert, describe, it } from 'vitest';

import type { SharedStateObjectPropertiesJson } from '../schemas/infoCourse.js';

import {
  SHARED_STATE_MAX_OBJECT_BYTES,
  classifySharedStateObjectPropertiesChange,
  computeSharedStateObjectFingerprint,
  diffSharedStateObjectValue,
  extractSharedStateObjectDefaults,
  normalizeSharedStateObjectValueForRead,
  validateSharedStateObjectProperties,
  validateSharedStateObjectValueForWrite,
} from './shared-state.js';

describe('validateSharedStateObjectProperties', () => {
  it('accepts a well-formed schema', () => {
    assert.deepEqual(
      validateSharedStateObjectProperties({
        stage: { type: 'number', default: 0 },
        completed: { type: 'boolean', default: false },
        status: { type: 'string', default: 'a', enum: ['a', 'b'] },
      }),
      [],
    );
  });

  it('rejects a default whose type does not match the declared type', () => {
    const errors = validateSharedStateObjectProperties({
      stage: { type: 'number', default: 'zero' },
    });
    assert.lengthOf(errors, 1);
    assert.match(errors[0], /default value must be of type "number"/);
  });

  it('rejects an enum on a boolean field', () => {
    const errors = validateSharedStateObjectProperties({
      flag: { type: 'boolean', default: true, enum: [true, false] as any },
    });
    assert.lengthOf(errors, 1);
    assert.match(errors[0], /boolean properties cannot have enum values/);
  });

  it('rejects a default that is not present in its own enum', () => {
    const errors = validateSharedStateObjectProperties({
      theme: { type: 'string', default: 'cooking', enum: ['sports', 'travel'] },
    });
    assert.lengthOf(errors, 1);
    assert.match(errors[0], /must be present in the enum options/);
  });

  it('rejects an enum value of the wrong type', () => {
    const errors = validateSharedStateObjectProperties({
      theme: { type: 'string', default: 'sports', enum: ['sports', 1] },
    });
    assert.lengthOf(errors, 1);
    assert.match(errors[0], /enum values must be of type "string"/);
  });
});

describe('extractSharedStateObjectDefaults', () => {
  it('pulls the default out of each property', () => {
    assert.deepEqual(
      extractSharedStateObjectDefaults({
        stage: { type: 'number', default: 0 },
        theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] },
      }),
      { stage: 0, theme: 'sports' },
    );
  });

  it('returns an empty object for no properties', () => {
    assert.deepEqual(extractSharedStateObjectDefaults({}), {});
  });
});

describe('computeSharedStateObjectFingerprint', () => {
  const properties: SharedStateObjectPropertiesJson = {
    theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] },
  };

  it('is stable across repeated calls with the same input', () => {
    assert.equal(
      computeSharedStateObjectFingerprint('assessment_instance', properties),
      computeSharedStateObjectFingerprint('assessment_instance', properties),
    );
  });

  it('is stable regardless of property key order', () => {
    const a = computeSharedStateObjectFingerprint('assessment_instance', {
      a: { type: 'number', default: 0 },
      b: { type: 'string', default: 'x' },
    });
    const b = computeSharedStateObjectFingerprint('assessment_instance', {
      b: { type: 'string', default: 'x' },
      a: { type: 'number', default: 0 },
    });
    assert.equal(a, b);
  });

  it('is stable regardless of enum value order', () => {
    const a = computeSharedStateObjectFingerprint('assessment_instance', {
      theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] },
    });
    const b = computeSharedStateObjectFingerprint('assessment_instance', {
      theme: { type: 'string', default: 'sports', enum: ['cooking', 'sports'] },
    });
    assert.equal(a, b);
  });

  it('differs when scope differs', () => {
    assert.notEqual(
      computeSharedStateObjectFingerprint('assessment_instance', properties),
      computeSharedStateObjectFingerprint('course_instance', properties),
    );
  });

  it('differs when a property changes', () => {
    assert.notEqual(
      computeSharedStateObjectFingerprint('assessment_instance', properties),
      computeSharedStateObjectFingerprint('assessment_instance', {
        theme: { type: 'string', default: 'cooking', enum: ['sports', 'cooking'] },
      }),
    );
  });
});

describe('classifySharedStateObjectPropertiesChange', () => {
  it('is compatible when nothing changed', () => {
    const properties: SharedStateObjectPropertiesJson = {
      stage: { type: 'number', default: 0 },
    };
    const result = classifySharedStateObjectPropertiesChange(properties, properties);
    assert.isTrue(result.compatible);
    assert.isEmpty(result.reasons);
  });

  it('is compatible when adding a new property', () => {
    const result = classifySharedStateObjectPropertiesChange(
      { stage: { type: 'number', default: 0 } },
      {
        stage: { type: 'number', default: 0 },
        completed: { type: 'boolean', default: false },
      },
    );
    assert.isTrue(result.compatible);
  });

  it('is compatible when widening an enum', () => {
    const result = classifySharedStateObjectPropertiesChange(
      { theme: { type: 'string', default: 'sports', enum: ['sports'] } },
      { theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] } },
    );
    assert.isTrue(result.compatible);
  });

  it('is breaking when a property is removed', () => {
    const result = classifySharedStateObjectPropertiesChange(
      { stage: { type: 'number', default: 0 }, completed: { type: 'boolean', default: false } },
      { stage: { type: 'number', default: 0 } },
    );
    assert.isFalse(result.compatible);
    assert.match(result.reasons[0], /removed or renamed/);
  });

  it('is breaking when a property changes type', () => {
    const result = classifySharedStateObjectPropertiesChange(
      { stage: { type: 'number', default: 0 } },
      { stage: { type: 'string', default: '0' } },
    );
    assert.isFalse(result.compatible);
    assert.match(result.reasons[0], /changed type/);
  });

  it('is breaking when a property changes its default', () => {
    const result = classifySharedStateObjectPropertiesChange(
      { stage: { type: 'number', default: 0 } },
      { stage: { type: 'number', default: 1 } },
    );
    assert.isFalse(result.compatible);
    assert.match(result.reasons[0], /changed its default/);
  });

  it('is breaking when an enum is narrowed', () => {
    const result = classifySharedStateObjectPropertiesChange(
      { theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] } },
      { theme: { type: 'string', default: 'sports', enum: ['sports'] } },
    );
    assert.isFalse(result.compatible);
    assert.match(result.reasons[0], /narrowed its enum/);
  });
});

describe('diffSharedStateObjectValue', () => {
  it('returns an empty patch when nothing changed', () => {
    assert.deepEqual(diffSharedStateObjectValue({ a: 1, b: 'x' }, { a: 1, b: 'x' }), {});
  });

  it('includes only the properties that changed', () => {
    assert.deepEqual(diffSharedStateObjectValue({ a: 1, b: 'x' }, { a: 2, b: 'x' }), { a: 2 });
  });

  it('includes newly-added properties', () => {
    assert.deepEqual(diffSharedStateObjectValue({ a: 1 }, { a: 1, b: 'x' }), { b: 'x' });
  });
});

describe('normalizeSharedStateObjectValueForRead', () => {
  const properties: SharedStateObjectPropertiesJson = {
    stage: { type: 'number', default: 0 },
    theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] },
  };

  it('fills in defaults for missing properties', () => {
    assert.deepEqual(normalizeSharedStateObjectValueForRead({}, properties), {
      stage: 0,
      theme: 'sports',
    });
  });

  it('drops properties the schema does not recognize', () => {
    assert.deepEqual(
      normalizeSharedStateObjectValueForRead(
        { stage: 2, theme: 'cooking', extra: 'x' },
        properties,
      ),
      { stage: 2, theme: 'cooking' },
    );
  });

  it('substitutes the default for a value of the wrong type', () => {
    assert.deepEqual(
      normalizeSharedStateObjectValueForRead({ stage: 'two', theme: 'cooking' }, properties),
      { stage: 0, theme: 'cooking' },
    );
  });

  it('substitutes the default for a value outside its enum', () => {
    assert.deepEqual(
      normalizeSharedStateObjectValueForRead({ stage: 2, theme: 'travel' }, properties),
      { stage: 2, theme: 'sports' },
    );
  });
});

describe('validateSharedStateObjectValueForWrite', () => {
  const properties: SharedStateObjectPropertiesJson = {
    stage: { type: 'number', default: 0 },
    theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] },
  };

  it('accepts a fully valid value', () => {
    assert.deepEqual(
      validateSharedStateObjectValueForWrite({ stage: 1, theme: 'cooking' }, properties),
      [],
    );
  });

  it('rejects an unknown property', () => {
    const errors = validateSharedStateObjectValueForWrite(
      { stage: 1, theme: 'cooking', extra: 'x' },
      properties,
    );
    assert.isTrue(errors.some((e) => e.includes('unknown property "extra"')));
  });

  it('rejects a value of the wrong type', () => {
    const errors = validateSharedStateObjectValueForWrite(
      { stage: 'one', theme: 'cooking' },
      properties,
    );
    assert.isTrue(errors.some((e) => e.includes('must be of type "number"')));
  });

  it('rejects a value outside its enum', () => {
    const errors = validateSharedStateObjectValueForWrite(
      { stage: 1, theme: 'travel' },
      properties,
    );
    assert.isTrue(errors.some((e) => e.includes('must be one of: sports, cooking')));
  });

  it('rejects a value that exceeds the per-object byte limit', () => {
    const errors = validateSharedStateObjectValueForWrite(
      { stage: 1, theme: 'a'.repeat(SHARED_STATE_MAX_OBJECT_BYTES) },
      { stage: { type: 'number', default: 0 }, theme: { type: 'string', default: '' } },
    );
    assert.isTrue(errors.some((e) => e.includes('exceeds the per-object limit')));
  });
});
