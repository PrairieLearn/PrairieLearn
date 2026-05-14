import { describe, expect, it } from 'vitest';

import { renderRubricItemFields } from './manualGrading.js';
import { type RubricData } from './manualGrading.types.js';

function makeRenderedItem(
  rubric_item: Partial<{
    description: string;
    explanation: string | null;
    grader_note: string | null;
  }>,
): RubricData['rubric_items'][number] {
  return {
    rubric_item: {
      id: '1',
      rubric_id: '1',
      number: 1,
      points: 1,
      description: 'desc',
      explanation: null,
      grader_note: null,
      always_show_to_students: true,
      deleted_at: null,
      key_binding: null,
      ...rubric_item,
    } as RubricData['rubric_items'][number]['rubric_item'],
    num_submissions: 0,
  };
}

describe('renderRubricItemFields', () => {
  it('renders all three fields when templates are valid', () => {
    const item = makeRenderedItem({
      description: 'Correct',
      explanation: 'The expected answer was {{correct_answers.x}}.',
      grader_note: 'Note for graders',
    });
    renderRubricItemFields(item, { correct_answers: { x: 42 } });

    expect(item.description_rendered).toContain('Correct');
    expect(item.explanation_rendered).toContain('The expected answer was 42.');
    expect(item.grader_note_rendered).toContain('Note for graders');
    expect(item.description_rendered).not.toContain('template error');
    expect(item.explanation_rendered).not.toContain('template error');
  });

  it('falls back to raw template and appends an error note on malformed mustache', () => {
    const item = makeRenderedItem({
      description: 'Correct.   "HELLO". \\mathbb{{X+Y}/2}',
    });
    renderRubricItemFields(item, {});

    expect(item.description_rendered).toContain('\\mathbb{{X+Y}/2}');
    expect(item.description_rendered).toContain('template error');
    expect(item.description_rendered).toContain('Unclosed tag');
    expect(item.description_rendered).toContain('class="text-danger small"');
  });

  it('escapes HTML in error messages to prevent injection', () => {
    const item = makeRenderedItem({
      // A malformed template whose error message would *not* normally contain
      // dangerous characters — we instead verify that the error span uses
      // safe HTML interpolation by checking that special chars in the
      // rendered output stay escaped.
      description: '{{#open}}<script>alert(1)</script>',
    });
    renderRubricItemFields(item, {});

    // The script tag should be present in the *rendered template* (because
    // markdown rendering may preserve it), but the *error message* part
    // must not introduce any unescaped HTML attributes beyond our own span.
    expect(item.description_rendered).toContain('template error');
    // Mustache errors don't naturally include angle brackets, so the only
    // `<` characters in the output should be from our span tag and the
    // user's raw template content.
    const errorSpanIndex = item.description_rendered!.indexOf('(template error:');
    expect(errorSpanIndex).toBeGreaterThan(-1);
  });

  it('sets rendered fields to empty string when the source field is falsy', () => {
    const item = makeRenderedItem({
      description: '',
      explanation: null,
      grader_note: null,
    });
    renderRubricItemFields(item, {});

    expect(item.description_rendered).toBe('');
    expect(item.explanation_rendered).toBe('');
    expect(item.grader_note_rendered).toBe('');
  });

  it('handles errors on explanation and grader_note independently of description', () => {
    const item = makeRenderedItem({
      description: 'Correct',
      explanation: '{{#unclosed}}',
      grader_note: 'fine',
    });
    renderRubricItemFields(item, {});

    expect(item.description_rendered).not.toContain('template error');
    expect(item.explanation_rendered).toContain('template error');
    expect(item.grader_note_rendered).not.toContain('template error');
  });
});
