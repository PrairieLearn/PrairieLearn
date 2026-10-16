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

  it('sanitizes HTML and Markdown links after expanding template variables', () => {
    const text =
      '<a href="java{{! Mustache comment }}script:alert(1)">HTML link</a> ' +
      '[Markdown link](java{{! Mustache comment }}script:alert%281%29)';
    assert.equal(
      renderText({ id: assessmentId, text }, urlPrefix),
      '<p><a>HTML link</a> <a>Markdown link</a></p>\n',
    );
  });

  it('renders Markdown with literal code', () => {
    const text = '## Instructions\n\nUse **exact values** and `5*4^2*2!`.';
    assert.equal(
      renderText({ id: assessmentId, text }, urlPrefix),
      '<h2>Instructions</h2>\n<p>Use <strong>exact values</strong> and <code>5*4^2*2!</code>.</p>\n',
    );
  });

  it('preserves formatted HTML blocks and math', () => {
    const text =
      '<div class="alert alert-info"><p><strong>Instructions</strong>: $x^2$</p><ul><li>Use **bold** notation.</li></ul><a href="https://example.com/formulas.pdf">Formula sheet</a></div>';
    assert.equal(renderText({ id: assessmentId, text }, urlPrefix), text);
  });

  describe('EJS-style syntax (legacy)', () => {
    it('renders clientFilesCourse', () => {
      const text = '<a href="<%= clientFilesCourse %>/file.pdf">Link</a>';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('renders clientFilesCourseInstance', () => {
      // Also tests whitespace variations
      const text = '<a href="<%=    clientFilesCourseInstance%>/file.pdf">Link</a>';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('renders clientFilesAssessment', () => {
      const text = '<a href="<%=clientFilesAssessment%>/file.pdf">Link</a>';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });
  });

  describe('Mustache-style syntax', () => {
    it('renders client_files_course', () => {
      const text = '[Link]({{ client_files_course }}/file.pdf)';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('renders client_files_course_instance', () => {
      const text = '[Link]({{ client_files_course_instance }}/file.pdf)';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });

    it('renders client_files_assessment', () => {
      const text = '[Link]({{ client_files_assessment }}/file.pdf)';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, urlPrefix)!), expected);
    });
  });
});
