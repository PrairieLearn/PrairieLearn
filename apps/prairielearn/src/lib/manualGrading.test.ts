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
    // Mustache embeds section names verbatim in its error messages, so a
    // section name containing dangerous HTML lets us actually exercise the
    // error-span escaping path (rather than relying on `<` chars from the
    // raw template that may be sanitized separately by markdown).
    const item = makeRenderedItem({
      description: '{{#<img src=x onerror=alert(1)>}}body',
    });
    renderRubricItemFields(item, {});

    const rendered = item.description_rendered!;
    expect(rendered).toContain('(template error:');

    // Locate the error-span region and assert about its content only — the
    // raw-template portion before it may be rendered as HTML by markdown.
    const errorSpanStart = rendered.indexOf('(template error:');
    expect(errorSpanStart).toBeGreaterThan(-1);
    const errorSpanRegion = rendered.slice(errorSpanStart);

    // The escaped form must be present...
    expect(errorSpanRegion).toContain('&lt;img');
    expect(errorSpanRegion).toContain('&gt;');
    // ...and the raw, executable form must not appear in the error span.
    // (`onerror=alert(1)` as plain text is harmless once `<` and `>` are
    // escaped — what matters is that the opening/closing tag chars never
    // make it through.)
    expect(errorSpanRegion).not.toContain('<img');
    expect(errorSpanRegion).not.toContain('alert(1)>');
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

  it('renders description as inline markdown (no <p> wrapper) and explanation/grader_note as block', () => {
    const item = makeRenderedItem({
      description: 'Correct **answer**',
      explanation: 'See `note`.',
      grader_note: 'Use `regex`.',
    });
    renderRubricItemFields(item, {});

    // Inline rendering: description is not wrapped in <p>...</p>.
    expect(item.description_rendered).toBe('Correct <strong>answer</strong>');
    // Block rendering: explanation and grader_note are wrapped in <p>...</p>.
    expect(item.explanation_rendered?.trim()).toBe('<p>See <code>note</code>.</p>');
    expect(item.grader_note_rendered?.trim()).toBe('<p>Use <code>regex</code>.</p>');
  });

  it('substitutes nested mustache fields from all three mustacheParams scopes', () => {
    const item = makeRenderedItem({
      description: 'Param x = {{params.x}}',
      explanation: 'Expected {{correct_answers.y}}; got {{submitted_answers.y}}.',
      grader_note: 'Threshold: {{params.threshold}}',
    });
    renderRubricItemFields(item, {
      params: { x: 1, threshold: 0.5 },
      correct_answers: { y: 42 },
      submitted_answers: { y: 41 },
    });

    expect(item.description_rendered).toContain('Param x = 1');
    expect(item.explanation_rendered).toContain('Expected 42; got 41.');
    expect(item.grader_note_rendered).toContain('Threshold: 0.5');
    expect(item.description_rendered).not.toContain('template error');
    expect(item.explanation_rendered).not.toContain('template error');
    expect(item.grader_note_rendered).not.toContain('template error');
  });

  it('passes through valid LaTeX with no mustache delimiters untouched', () => {
    const item = makeRenderedItem({
      description: 'Use $\\mathbb{R}^n$.',
      explanation: 'Magnitude is $|\\vec{v}| = \\sqrt{x^2 + y^2}$.',
    });
    renderRubricItemFields(item, {});

    // Markdown escapes `\` somewhat, but the user-visible LaTeX content survives.
    expect(item.description_rendered).toContain('\\mathbb{R}^n');
    expect(item.explanation_rendered).toContain('\\sqrt{x^2 + y^2}');
    expect(item.description_rendered).not.toContain('template error');
    expect(item.explanation_rendered).not.toContain('template error');
  });
});
