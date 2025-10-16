import { assert, describe, it } from 'vitest';

import { courseRepoContentUrl, httpPrefixForCourseRepo } from './github.js';

describe('Github library', () => {
  describe('httpPrefixforCourseRepo', () => {
    it('Converts to HTTPS prefix when repo has proper format', () => {
      assert.equal(
        httpPrefixForCourseRepo('git@github.com:username/repo.git'),
        'https://github.com/username/repo',
      );
      assert.equal(
        httpPrefixForCourseRepo('git@github.com:username2/repo-other.git'),
        'https://github.com/username2/repo-other',
      );
      assert.equal(
        httpPrefixForCourseRepo('git@github.com:username3/repo-yet-another'),
        'https://github.com/username3/repo-yet-another',
      );
      assert.equal(
        httpPrefixForCourseRepo('git@github.com:onemore/repository.git/'),
        'https://github.com/onemore/repository',
      );
    });

    it('Returns null if repo uses a different format', () => {
      assert.isNull(httpPrefixForCourseRepo('https://github.com/username/repo.git'));
      assert.isNull(httpPrefixForCourseRepo('https://www.github.com/username/repo.git'));
      assert.isNull(httpPrefixForCourseRepo('git@gitlab.com:username/repo.git'));
    });

    it('Returns null if repo is not provided', () => {
      assert.isNull(httpPrefixForCourseRepo(''));
      assert.isNull(httpPrefixForCourseRepo(null));
    });
  });

  describe('courseRepoContentUrl', () => {
    it('Computes a URL for the example course', () => {
      const course = { repository: 'IRRELEVANT', branch: 'IRRELEVANT', example_course: true };
      assert.equal(
        courseRepoContentUrl(course),
        'https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse',
      );
      assert.equal(
        courseRepoContentUrl(course, 'questions/addNumbers'),
        'https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/addNumbers',
      );
      assert.equal(
        courseRepoContentUrl(course, '/courseInstances/Sp15'),
        'https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/courseInstances/Sp15',
      );
    });

    it('Computes a URL for a non-example course when repo has proper format', () => {
      const course = {
        repository: 'git@github.com:username/repo.git',
        branch: 'master',
        example_course: false,
      };
      assert.equal(courseRepoContentUrl(course), 'https://github.com/username/repo/tree/master');
      assert.equal(
        courseRepoContentUrl(course, 'questions/addNumbers'),
        'https://github.com/username/repo/tree/master/questions/addNumbers',
      );
      assert.equal(
        courseRepoContentUrl(course, '/courseInstances/Sp15'),
        'https://github.com/username/repo/tree/master/courseInstances/Sp15',
      );
    });

    it('Returns null if repo is not provided', () => {
      const course = { repository: null, branch: 'master', example_course: false };
      assert.isNull(courseRepoContentUrl(course));
      assert.isNull(courseRepoContentUrl(course, 'questions/addNumbers'));
      assert.isNull(courseRepoContentUrl(course, '/courseInstances/Sp15'));
    });
  });
});
