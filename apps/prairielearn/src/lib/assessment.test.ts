import { assert, describe, it } from 'vitest';

import { renderText } from './assessment.js';

describe('renderText', () => {
  const urlPrefix = '/pl/course_instance/1';
  const assessmentId = '42';
  // Mustache HTML-escapes / to &#x2F; which is valid and browsers decode it correctly
  const escapedUrlPrefix = '&#x2F;pl&#x2F;course_instance&#x2F;1';

  it('returns null for null text', () => {
    assert.isNull(renderText({ id: assessmentId, text: null }, urlPrefix));
  });

  it('returns text unchanged when no template variables', () => {
    const text = '<p>Hello world</p>';
    assert.equal(renderText({ id: assessmentId, text }, urlPrefix), text);
  });

  describe('EJS-style syntax (legacy)', () => {
    it('renders clientFilesCourse', () => {
      const text = '<a href="<%= clientFilesCourse %>/file.pdf">Link</a>';
      const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesCourse/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders clientFilesCourseInstance', () => {
      const text = '<a href="<%= clientFilesCourseInstance %>/file.pdf">Link</a>';
      const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesCourseInstance/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders clientFilesAssessment', () => {
      const text = '<a href="<%= clientFilesAssessment %>/file.pdf">Link</a>';
      const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('handles whitespace variations', () => {
      const text = '<a href="<%=clientFilesAssessment%>/file.pdf">Link</a>';
      const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });
  });

  describe('Mustache-style syntax', () => {
    it('renders clientFilesCourse', () => {
      const text = '<a href="{{ clientFilesCourse }}/file.pdf">Link</a>';
      // Mustache HTML-escapes the output, so / becomes &#x2F;
      const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesCourse/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders clientFilesCourseInstance', () => {
      const text = '<a href="{{ clientFilesCourseInstance }}/file.pdf">Link</a>';
      const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesCourseInstance/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders clientFilesAssessment', () => {
      const text = '<a href="{{ clientFilesAssessment }}/file.pdf">Link</a>';
      const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('handles no whitespace', () => {
      const text = '<a href="{{clientFilesAssessment}}/file.pdf">Link</a>';
      const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });
  });

  it('renders multiple Mustache variables in same text', () => {
    const text =
      '<a href="{{ clientFilesCourse }}/a.pdf">A</a> <a href="{{ clientFilesAssessment }}/b.pdf">B</a>';
    const expected = `<a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesCourse/a.pdf">A</a> <a href="${escapedUrlPrefix}&#x2F;assessment&#x2F;${assessmentId}&#x2F;clientFilesAssessment/b.pdf">B</a>`;
    assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
  });
});
