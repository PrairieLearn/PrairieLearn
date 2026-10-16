import { describe, expect, it } from 'vitest';

import { buildInstructions } from './instructions.js';

describe('buildInstructions', () => {
  it('names the course when context is provided', () => {
    expect(
      buildInstructions({ courseTitle: 'Intro to Programming', courseShortName: 'CS 101' }),
    ).toContain('"CS 101: Intro to Programming"');
    expect(buildInstructions(undefined)).toContain('a PrairieLearn course');
  });
});
