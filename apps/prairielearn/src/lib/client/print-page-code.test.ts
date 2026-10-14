import { describe, expect, it } from 'vitest';

import {
  type PrintPageIdentity,
  decodePrintPageIdentity,
  encodePrintPageIdentity,
} from './print-page-code.js';

const identity: PrintPageIdentity = {
  assessmentInstanceId: '9007199254740993',
  pageNumber: 5,
  document: 'answer_key',
  format: 'pdf',
  exportId: '369a9f0f-989b-43d2-980d-b3e5a9d67254',
};

describe('print page identity', () => {
  it('preserves the page and export identifiers without personal information', () => {
    expect(decodePrintPageIdentity(encodePrintPageIdentity(identity))).toEqual(identity);
    expect(encodePrintPageIdentity(identity)).toMatch(/^[A-Z0-9:]+$/);
    expect(encodePrintPageIdentity(identity).length).toBeLessThan(80);
  });

  it('rejects unsupported versions, malformed metadata, and nonphysical page numbers', () => {
    const value = encodePrintPageIdentity(identity);
    expect(() => decodePrintPageIdentity(value.replace('PL:PRINT:2:', 'PL:PRINT:3:'))).toThrow(
      'Unsupported',
    );
    expect(() => decodePrintPageIdentity('PL:PRINT:2:invalid')).toThrow();
    for (const pageNumber of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => encodePrintPageIdentity({ ...identity, pageNumber })).toThrow();
    }
  });
});
