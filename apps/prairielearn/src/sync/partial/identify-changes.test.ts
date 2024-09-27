import { assert } from 'chai';

import { extractCourseInstanceFromPath, identifyChanges } from './identify-changes.js';

const COURSE_INSTANCE_NAMES = new Set(['foo', 'bar/baz']);

describe('extractCourseInstanceFromPath', () => {
  it('handles simple course instance', () => {
    const name = extractCourseInstanceFromPath(
      COURSE_INSTANCE_NAMES,
      'courseInstances/foo/infoCourseInstance.json',
    );
    assert.equal(name, 'foo');
  });

  it('handles nested course instance', () => {
    const name = extractCourseInstanceFromPath(
      COURSE_INSTANCE_NAMES,
      'courseInstances/bar/baz/infoCourseInstance.json',
    );
    assert.equal(name, 'bar/baz');
  });

  it('handles assessment JSON path', () => {
    const name = extractCourseInstanceFromPath(
      COURSE_INSTANCE_NAMES,
      'courseInstances/bar/baz/assessments/bar.json',
    );
    assert.equal(name, 'bar/baz');
  });

  it('handles non-course-instance path', () => {
    const name = extractCourseInstanceFromPath(COURSE_INSTANCE_NAMES, 'questions/foo/info.json');
    assert.isNull(name);
  });

  it('handles path with non-existent course instance', () => {
    const name = extractCourseInstanceFromPath(
      COURSE_INSTANCE_NAMES,
      'courseInstances/nonexistent/infoCourseInstance.json',
    );
    assert.isNull(name);
  });
});

describe('identifyChanges', () => {
  it('handles change to infoCourse.json', () => {
    const changes = identifyChanges(['infoCourse.json'], COURSE_INSTANCE_NAMES);

    assert.isTrue(changes.syncCourse);
    assert.isFalse(changes.syncQuestions);
    assert.isFalse(changes.syncCourseInstances);
    assert.isEmpty(changes.syncCourseInstanceAssessments);
  });

  it('handles changes to a question', () => {
    const changes = identifyChanges(['questions/foo/info.json'], COURSE_INSTANCE_NAMES);

    assert.isFalse(changes.syncCourse);
    assert.isTrue(changes.syncQuestions);
    assert.isFalse(changes.syncCourseInstances);
    assert.isEmpty(changes.syncCourseInstanceAssessments);
  });

  it('handles changes to a course instance', () => {
    const changes = identifyChanges(
      ['courseInstances/foo/infoCourseInstance.json'],
      COURSE_INSTANCE_NAMES,
    );

    assert.isFalse(changes.syncCourse);
    assert.isFalse(changes.syncQuestions);
    assert.isTrue(changes.syncCourseInstances);
    assert.sameMembers(Array.from(changes.syncCourseInstanceAssessments), ['foo']);
  });

  it('handles changes to a nested course instance', () => {
    const changes = identifyChanges(
      ['courseInstances/bar/baz/infoCourseInstance.json'],
      COURSE_INSTANCE_NAMES,
    );

    assert.isFalse(changes.syncCourse);
    assert.isFalse(changes.syncQuestions);
    assert.isTrue(changes.syncCourseInstances);
    assert.sameMembers(Array.from(changes.syncCourseInstanceAssessments), ['bar/baz']);
  });

  it('handles changes to an assessment', () => {
    const changes = identifyChanges(
      ['courseInstances/foo/assessments/bar/infoAssessment.json'],
      COURSE_INSTANCE_NAMES,
    );

    assert.isFalse(changes.syncCourse);
    assert.isFalse(changes.syncQuestions);
    assert.isFalse(changes.syncCourseInstances);
    assert.sameMembers(Array.from(changes.syncCourseInstanceAssessments), ['foo']);
  });

  it('handles multiple changes', () => {
    const changes = identifyChanges(
      [
        'infoCourse.json',
        'questions/foo/info.json',
        'courseInstances/foo/infoCourseInstance.json',
        'courseInstances/foo/assessments/bar.json',
      ],
      COURSE_INSTANCE_NAMES,
    );

    assert.isTrue(changes.syncCourse);
    assert.isTrue(changes.syncQuestions);
    assert.isTrue(changes.syncCourseInstances);
    assert.sameMembers(Array.from(changes.syncCourseInstanceAssessments), ['foo']);
  });

  it('handles changes to unrelated files', () => {
    const changes = identifyChanges(
      [
        'unrelated.txt',
        'questions/foo/question.html',
        'courseInstances/foo/clientFilesCourseInstance/formulas.pdf',
        'courseInstances/bar/baz/assessments/bar/clientFilesAssessment/formulas.pdf',
      ],
      COURSE_INSTANCE_NAMES,
    );

    assert.isFalse(changes.syncCourse);
    assert.isFalse(changes.syncQuestions);
    assert.isFalse(changes.syncCourseInstances);
    assert.isEmpty(changes.syncCourseInstanceAssessments);
  });
});
