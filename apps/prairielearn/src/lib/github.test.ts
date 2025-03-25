import { assert } from 'chai';

import { httpPrefixForCourseRepo } from './github.js';

describe('Github library', () => {
  describe('httpPrefixforCourseRepo', () => {
    it('handles the example course', async () => {
      assert.equal(
        httpPrefixForCourseRepo({
          example_course: true,
          repository: null,
        }),
        'https://github.com/PrairieLearn/PrairieLearn',
      );
    });

    it('Converts to HTTPS prefix when repo has proper format', async () => {
      assert.equal(
        httpPrefixForCourseRepo({
          example_course: false,
          repository: 'git@github.com:username/repo.git',
        }),
        'https://github.com/username/repo',
      );
      assert.equal(
        httpPrefixForCourseRepo({
          example_course: false,
          repository: 'git@github.com:username2/repo-other.git',
        }),
        'https://github.com/username2/repo-other',
      );
      assert.equal(
        httpPrefixForCourseRepo({
          example_course: false,
          repository: 'git@github.com:username3/repo-yet-another',
        }),
        'https://github.com/username3/repo-yet-another',
      );
      assert.equal(
        httpPrefixForCourseRepo({
          example_course: false,
          repository: 'git@github.com:onemore/repository.git/',
        }),
        'https://github.com/onemore/repository',
      );
    });

    it('Returns null if repo uses a different format', async () => {
      assert.isNull(
        httpPrefixForCourseRepo({
          example_course: false,
          repository: 'https://github.com/username/repo.git',
        }),
      );
      assert.isNull(
        httpPrefixForCourseRepo({
          example_course: false,
          repository: 'https://www.github.com/username/repo.git',
        }),
      );
      assert.isNull(
        httpPrefixForCourseRepo({
          example_course: false,
          repository: 'git@gitlab.com:username/repo.git',
        }),
      );
    });

    it('Returns null if repo is not provided', async () => {
      assert.isNull(httpPrefixForCourseRepo({ example_course: false, repository: '' }));
      assert.isNull(httpPrefixForCourseRepo({ example_course: false, repository: null }));
    });
  });
});
