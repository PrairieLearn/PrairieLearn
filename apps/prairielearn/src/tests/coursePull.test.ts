import { execa } from 'execa';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { pullAndUpdateCourse } from '../lib/course.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseById } from '../models/course.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

async function pullCourse() {
  const { jobSequenceId } = await pullAndUpdateCourse({
    course: await selectCourseById('1'),
    userId: null,
    authnUserId: null,
  });
  return await helperServer.waitForJobSequence(jobSequenceId);
}

describe('Pulling a course from its remote repository', { concurrent: false }, () => {
  let courseRepo: CourseRepoFixture;

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
  });

  afterAll(helperServer.after);

  test('fails when the course branch was deleted from the remote', async () => {
    assert.equal((await pullCourse()).status, 'Success');

    // Rename `master` to `main` in the origin. The live repo still has a
    // remote-tracking `origin/master` ref from its original clone.
    await execa('git', ['branch', '-m', 'master', 'main'], { cwd: courseRepo.courseOriginDir });

    assert.equal((await pullCourse()).status, 'Error');
  });
});
