import { assert, describe, it } from 'vitest';

import { renderText } from './assessment.js';

describe('renderText', () => {
  const urlPrefix = '/pl/course_instance/1';
  const assessmentId = '42';
  const expectedUrlBase = `${urlPrefix}/assessment/${assessmentId}`;

  it('returns null for null text', () => {
    assert.isNull(renderText({ id: assessmentId, text: null }, urlPrefix));
  });

  it('returns text unchanged when no template variables', () => {
    const text = '<p>Hello world</p>';
    assert.equal(renderText({ id: assessmentId, text }, urlPrefix), text);
  });

  describe('EJS-style syntax (legacy camelCase)', () => {
    it('renders clientFilesCourse', () => {
      const text = '<a href="<%= clientFilesCourse %>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders clientFilesCourseInstance', () => {
      const text = '<a href="<%= clientFilesCourseInstance %>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders clientFilesAssessment', () => {
      const text = '<a href="<%= clientFilesAssessment %>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('handles whitespace variations', () => {
      const text = '<a href="<%=clientFilesAssessment%>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });
  });

  describe('EJS-style syntax (legacy snake_case)', () => {
    it('renders client_files_course', () => {
      const text = '<a href="<%= client_files_course %>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders client_files_course_instance', () => {
      const text = '<a href="<%= client_files_course_instance %>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders client_files_assessment', () => {
      const text = '<a href="<%= client_files_assessment %>/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });
  });

  describe('Mustache-style syntax (camelCase)', () => {
    it('renders clientFilesCourse', () => {
      const text = '<a href="{{ clientFilesCourse }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders clientFilesCourseInstance', () => {
      const text = '<a href="{{ clientFilesCourseInstance }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders clientFilesAssessment', () => {
      const text = '<a href="{{ clientFilesAssessment }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('handles no whitespace', () => {
      const text = '<a href="{{clientFilesAssessment}}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });
  });

  describe('Mustache-style syntax (snake_case)', () => {
    it('renders client_files_course', () => {
      const text = '<a href="{{ client_files_course }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourse/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders client_files_course_instance', () => {
      const text = '<a href="{{ client_files_course_instance }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesCourseInstance/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });

    it('renders client_files_assessment', () => {
      const text = '<a href="{{ client_files_assessment }}/file.pdf">Link</a>';
      const expected = `<a href="${expectedUrlBase}/clientFilesAssessment/file.pdf">Link</a>`;
      assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
    });
  });

  it('renders multiple Mustache variables in same text', () => {
    const text =
      '<a href="{{ clientFilesCourse }}/a.pdf">A</a> <a href="{{ clientFilesAssessment }}/b.pdf">B</a>';
    const expected = `<a href="${expectedUrlBase}/clientFilesCourse/a.pdf">A</a> <a href="${expectedUrlBase}/clientFilesAssessment/b.pdf">B</a>`;
    assert.equal(renderText({ id: assessmentId, text }, urlPrefix), expected);
  });
});
