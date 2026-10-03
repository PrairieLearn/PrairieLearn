import { describe, expect, it } from 'vitest';

import {
  type PrintPageIdentity,
  decodePrintPageIdentity,
  encodePrintPageIdentity,
} from './print-page-code.js';

const identity: PrintPageIdentity = {
  courseId: '9007199254740993',
  assessmentId: '63',
  assessmentInstanceId: '16',
  pageNumber: 5,
  generatedBy: { userId: '1', uid: 'instructor@example.edu', name: 'Zoë 李' },
  generatedAt: '2026-09-11T12:34:56.000Z',
  document: 'answer_key',
  format: 'pdf',
  exportId: '369a9f0f-989b-43d2-980d-b3e5a9d67254',
};

describe('print page identity', () => {
  it('preserves all identifiers, Unicode names, and generation context', () => {
    expect(decodePrintPageIdentity(encodePrintPageIdentity(identity))).toEqual(identity);
    expect(
      decodePrintPageIdentity(
        encodePrintPageIdentity({
          ...identity,
          generatedBy: { ...identity.generatedBy, name: null },
        }),
      ).generatedBy.name,
    ).toBeNull();
  });

  it('rejects unsupported versions, malformed metadata, and nonphysical page numbers', () => {
    const value = encodePrintPageIdentity(identity);
    expect(() => decodePrintPageIdentity(value.replace('pl:print:1:', 'pl:print:2:'))).toThrow(
      'Unsupported',
    );
    expect(() => decodePrintPageIdentity('pl:print:1:{}')).toThrow();
    for (const pageNumber of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => encodePrintPageIdentity({ ...identity, pageNumber })).toThrow();
    }
  });
});
