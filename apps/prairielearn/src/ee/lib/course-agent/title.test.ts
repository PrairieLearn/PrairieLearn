import { describe, expect, it } from 'vitest';

import { formatCourseAgentConversationTitle } from './title.js';

describe('formatCourseAgentConversationTitle', () => {
  it('collapses whitespace', () => {
    expect(formatCourseAgentConversationTitle('  Add a\n\nquestion\tabout  limits ')).toBe(
      'Add a question about limits',
    );
  });

  it('truncates long titles by code point without splitting surrogate pairs', () => {
    const title = formatCourseAgentConversationTitle(`${'a'.repeat(76)}📚📚📚📚📚`);
    expect(title).toBe(`${'a'.repeat(76)}📚...`);
    expect([...title]).toHaveLength(80);
  });
});
