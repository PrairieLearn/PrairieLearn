import * as cheerio from 'cheerio';
import { decode } from 'he';
import { assert, describe, it } from 'vitest';

import { renderText } from './assessment.js';

describe('renderText', () => {
  const urlPrefix = '/pl/course_instance/1';
  const assessmentId = '42';
  const expectedUrlBase = `${urlPrefix}/assessment/${assessmentId}`;
  const markdownOptions = { urlPrefix, markdownEnabled: true };

  it('returns null for null text', () => {
    assert.isNull(renderText({ id: assessmentId, text: null }, { urlPrefix }));
  });

  it('sanitizes HTML and Markdown links after expanding template variables', () => {
    const text =
      '<a href="java{{! Mustache comment }}script:alert(1)">HTML link</a> ' +
      '[Markdown link](java{{! Mustache comment }}script:alert%281%29)';
    assert.equal(
      renderText({ id: assessmentId, text }, markdownOptions),
      '<p><a>HTML link</a> <a>Markdown link</a></p>\n',
    );
  });

  it('renders Markdown with literal code', () => {
    const text = '## Instructions\n\nUse **exact values** and `5*4^2*2!`.';
    assert.equal(
      renderText({ id: assessmentId, text }, markdownOptions),
      '<h2>Instructions</h2>\n<p>Use <strong>exact values</strong> and <code>5*4^2*2!</code>.</p>\n',
    );
  });

  it('opens overview resources in separate tabs only in LockDown Browser', () => {
    for (const markdownEnabled of [false, true]) {
      const text = [
        '<a href="{{ client_files_course }}/formulas.pdf" target="_self" rel="nofollow">Formulas</a>',
        '<a href="https://example.com/reference">Reference</a>',
        '<a href="#instructions">Instructions</a>',
        '<a href="mailto:instructor@example.com">Email</a>',
        markdownEnabled
          ? '[Markdown resource](./reference.html)'
          : '<a href="./reference.html">HTML resource</a>',
        ...(markdownEnabled
          ? []
          : ['<a href="/help" role="button" data-bs-toggle="modal">Help</a>']),
      ].join('\n\n');
      const options = { urlPrefix, markdownEnabled };
      const normal = cheerio.load(renderText({ id: assessmentId, text }, options)!);
      assert.equal(normal('a').eq(0).attr('target'), '_self');
      assert.isUndefined(normal('a').eq(1).attr('target'));

      const $ = cheerio.load(
        renderText({ id: assessmentId, text }, { ...options, lockdownBrowser: true })!,
      );
      assert.equal($('a').eq(0).attr('href'), `${expectedUrlBase}/clientFilesCourse/formulas.pdf`);
      assert.equal($('a').eq(0).attr('rel'), 'nofollow noopener noreferrer');
      assert.deepEqual(
        $('a')
          .toArray()
          .map((link) => $(link).attr('target')),
        [
          '_blank',
          '_blank',
          undefined,
          undefined,
          '_blank',
          ...(!markdownEnabled ? [undefined] : []),
        ],
      );
      assert.equal($('a').eq(1).attr('rel'), 'noopener noreferrer');
      assert.equal($('a').eq(4).attr('rel'), 'noopener noreferrer');
    }
  });

  it('preserves semantic HTML and literal math while removing custom formatting', () => {
    const text =
      '<div class="alert alert-info"><p><strong>Instructions</strong>: $x^2$</p><ul><li>Use **bold** notation.</li></ul><a href="https://example.com/formulas.pdf">Formula sheet</a></div>';
    assert.equal(
      renderText({ id: assessmentId, text }, markdownOptions),
      '<div><p><strong>Instructions</strong>: $x^2$</p><ul><li>Use **bold** notation.</li></ul><a href="https://example.com/formulas.pdf">Formula sheet</a></div>',
    );
  });

  describe('EJS-style syntax (legacy)', () => {
    it('renders clientFilesCourse', () => {
      const text = '<a href="<%= clientFilesCourse %>/file.pdf">Link</a>';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, markdownOptions)!), expected);
    });

    it('renders clientFilesCourseInstance', () => {
      // Also tests whitespace variations
      const text = '<a href="<%=    clientFilesCourseInstance%>/file.pdf">Link</a>';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, markdownOptions)!), expected);
    });

    it('renders clientFilesAssessment', () => {
      const text = '<a href="<%=clientFilesAssessment%>/file.pdf">Link</a>';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, markdownOptions)!), expected);
    });
  });

  describe('Mustache-style syntax', () => {
    it('renders client_files_course', () => {
      const text = '[Link]({{ client_files_course }}/file.pdf)';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, markdownOptions)!), expected);
    });

    it('renders client_files_course_instance', () => {
      const text = '[Link]({{ client_files_course_instance }}/file.pdf)';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, markdownOptions)!), expected);
    });

    it('renders client_files_assessment', () => {
      const text = '[Link]({{ client_files_assessment }}/file.pdf)';
      const expected = `<p><a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a></p>\n`;
      assert.equal(decode(renderText({ id: assessmentId, text }, markdownOptions)!), expected);
    });
  });
});
