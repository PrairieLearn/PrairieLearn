import { describe, expect, it } from 'vitest';

import { applyBooleanFilter } from './BooleanColumnFilter.js';

describe('applyBooleanFilter', () => {
  it('matches rows selected by include-mode filters', () => {
    expect(applyBooleanFilter({ values: ['Yes'], mode: 'include' }, true)).toBe(true);
    expect(applyBooleanFilter({ values: ['Yes'], mode: 'include' }, false)).toBe(false);
    expect(applyBooleanFilter({ values: ['No'], mode: 'include' }, true)).toBe(false);
    expect(applyBooleanFilter({ values: ['No'], mode: 'include' }, false)).toBe(true);
  });

  it('treats exclude-mode filters as include-mode filters', () => {
    expect(applyBooleanFilter({ values: ['Yes'], mode: 'exclude' }, true)).toBe(true);
    expect(applyBooleanFilter({ values: ['Yes'], mode: 'exclude' }, false)).toBe(false);
    expect(applyBooleanFilter({ values: ['No'], mode: 'exclude' }, true)).toBe(false);
    expect(applyBooleanFilter({ values: ['No'], mode: 'exclude' }, false)).toBe(true);
  });

  it('does not filter rows when unset or empty', () => {
    expect(applyBooleanFilter(undefined, true)).toBe(true);
    expect(applyBooleanFilter(undefined, false)).toBe(true);
    expect(applyBooleanFilter({ values: [], mode: 'include' }, true)).toBe(true);
    expect(applyBooleanFilter({ values: [], mode: 'include' }, false)).toBe(true);
  });
});
