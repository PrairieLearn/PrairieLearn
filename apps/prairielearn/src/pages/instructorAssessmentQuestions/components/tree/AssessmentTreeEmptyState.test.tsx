import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AssessmentTreeEmptyState } from './AssessmentTreeEmptyState.js';

const CREATE_URL = '/pl/course_instance/1/instructor/course_admin/questions/create';
const noop = () => {};

describe('AssessmentTreeEmptyState', () => {
  it('offers to add questions when the course already has questions', () => {
    const html = renderToStaticMarkup(
      <AssessmentTreeEmptyState
        questionCreateUrl={CREATE_URL}
        canEdit
        canAddQuestions
        courseHasQuestions
        onAddFirstQuestions={noop}
      />,
    );
    expect(html).toContain('Add questions');
    expect(html).not.toContain('Create a question');
  });

  it('offers to create a question (linking to the create page) when the course has none', () => {
    const html = renderToStaticMarkup(
      <AssessmentTreeEmptyState
        courseHasQuestions={false}
        questionCreateUrl={CREATE_URL}
        canEdit
        canAddQuestions
        onAddFirstQuestions={noop}
      />,
    );
    expect(html).toContain('Create a question');
    expect(html).toContain(CREATE_URL);
    expect(html).not.toContain('Add questions');
  });

  it('omits the create CTA when the user cannot edit the course', () => {
    const html = renderToStaticMarkup(
      <AssessmentTreeEmptyState
        canEdit={false}
        canAddQuestions={false}
        courseHasQuestions={false}
        questionCreateUrl={CREATE_URL}
        onAddFirstQuestions={noop}
      />,
    );
    expect(html).toContain('This assessment has no questions yet');
    expect(html).not.toContain('Create a question');
  });

  it('omits the add CTA when the assessment cannot be edited', () => {
    const html = renderToStaticMarkup(
      <AssessmentTreeEmptyState
        canAddQuestions={false}
        questionCreateUrl={CREATE_URL}
        canEdit
        courseHasQuestions
        onAddFirstQuestions={noop}
      />,
    );
    expect(html).not.toContain('Add questions');
  });
});
