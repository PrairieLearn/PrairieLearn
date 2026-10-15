import { decode } from 'he';
import { assert, describe, it } from 'vitest';

import { renderText } from './assessment.js';

describe('renderText', () => {
  const urlPrefix = '/pl/course_instance/1';
  const assessmentId = '42';
  const expectedUrlBase = `${urlPrefix}/assessment/${assessmentId}`;

  it('returns null for null text', () => {
    assert.isNull(renderText({ id: assessmentId, text: null }, urlPrefix));
  });

  it('sanitizes after expanding template variables', () => {
    const text = '<a href="java{{! Mustache comment }}script:alert(1)">Link</a>';
    assert.equal(renderText({ id: assessmentId, text }, urlPrefix), '<a>Link</a>');
  });

  it('preserves formatted HTML and math without interpreting Markdown', () => {
    const text =
      '<div class="alert alert-info"><p><strong>Instructions</strong>: $x^2$</p><ul><li>Use **bold** notation.</li></ul><a href="https://example.com/formulas.pdf">Formula sheet</a></div>';
    assert.equal(renderText({ id: assessmentId, text }, urlPrefix), text);
  });

  describe('EJS-style syntax (legacy)', () => {
    it('renders clientFilesCourse', () => {
      const text = '<a href="<%= clientFilesCourse %>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a>`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('renders clientFilesCourseInstance', () => {
      // Also tests whitespace variations
      const text = '<a href="<%=    clientFilesCourseInstance%>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a>`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('renders clientFilesAssessment', () => {
      const text = '<a href="<%= clientFilesAssessment %>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('handles whitespace variations', () => {
      const text = '<a href="<%=clientFilesAssessment%>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });
  });

  describe('Mustache-style syntax', () => {
    it('renders client_files_course', () => {
      const text = '<a href="{{ client_files_course }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a>`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('renders client_files_course_instance', () => {
      const text = '<a href="{{ client_files_course_instance }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a>`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('renders client_files_assessment', () => {
      const text = '<a href="{{ client_files_assessment }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });
  });
});
