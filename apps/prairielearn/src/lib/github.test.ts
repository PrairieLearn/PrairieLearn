import { assert } from 'chai';

import { httpPrefixForCourseRepo } from './github.js';

describe('Github library', () => {
  describe('httpPrefixforCourseRepo', () => {
    it('Converts to HTTPS prefix when repo has proper format', async () => {
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

    it('Returns null if repo uses a different format', async () => {
      assert.isNull(httpPrefixForCourseRepo('https://github.com/username/repo.git'));
      assert.isNull(httpPrefixForCourseRepo('https://www.github.com/username/repo.git'));
      assert.isNull(httpPrefixForCourseRepo('git@gitlab.com:username/repo.git'));
    });

    it('Returns null if repo is not provided', async () => {
      assert.isNull(httpPrefixForCourseRepo(''));
      assert.isNull(httpPrefixForCourseRepo(null));
    });
  });
});
