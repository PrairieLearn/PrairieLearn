import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { insertCourse, selectOptionalCourseByGithubRepository } from './course.js';

describe('course model', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  describe('selectOptionalCourseByGithubRepository', () => {
    it('matches GitHub SSH URLs with a slash after the colon', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const user = await getOrCreateUser({
          uid: 'course-model@example.com',
          name: 'Course Model Test User',
          uin: 'course-model@example.com',
          email: 'course-model@example.com',
        });
        const insertedCourse = await insertCourse({
          institution_id: '1',
          short_name: 'COURSE MODEL 101',
          title: 'Course Model Test Course',
          display_timezone: 'America/Chicago',
          path: 'course-model-test-course',
          repository: 'git@github.com:/Org/repo.git',
          branch: 'master',
          authn_user_id: user.id,
        });

        const course = await selectOptionalCourseByGithubRepository({
          owner: 'Org',
          repoName: 'repo',
        });

        assert.equal(course?.id, insertedCourse.id);
      });
    });
  });
});
