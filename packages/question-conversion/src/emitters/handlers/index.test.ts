import { assert, describe, it } from 'vitest';

import type { IRQuestionBody } from '../../types/ir.js';

import { createPLBodyRegistry } from './index.js';

const BODY_TYPES = {
  'multiple-choice': true,
  checkbox: true,
  matching: true,
  'fill-in-blanks': true,
  'multiple-dropdowns': true,
  numeric: true,
  integer: true,
  'string-input': true,
  ordering: true,
  'rich-text': true,
  'text-only': true,
  'file-upload': true,
  calculated: true,
} satisfies Record<IRQuestionBody['type'], true>;

describe('createPLBodyRegistry', () => {
  it('registers every IR question body type and no others', () => {
    const registry = createPLBodyRegistry();

    assert.sameMembers(registry.supportedTypes(), Object.keys(BODY_TYPES));
  });
});
