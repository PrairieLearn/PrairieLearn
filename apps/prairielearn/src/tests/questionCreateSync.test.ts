import path from 'node:path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, it, vi } from 'vitest';

import { config } from '../lib/config.js';
import { QuestionAddEditor, QuestionCopyEditor } from '../lib/editors.js';
import {
  recordSuccessfulCourseSync,
  selectCourseById,
  updateCourseCommitHash,
} from '../models/course.js';
import { selectQuestionByUuid } from '../models/question.js';
import { selectUserById } from '../models/user.js';
import * as courseDB from '../sync/course-db.js';
import { CURRENT_SYNC_VERSION } from '../sync/version.js';

import { type CourseRepoFixture, createCourseRepoFixture } from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { captureDatabaseSnapshot, syncCourseData } from './sync/util.js';

let fixture: CourseRepoFixture;

beforeAll(async () => {
  fixture = await createCourseRepoFixture(
    path.join(import.meta.dirname, 'testFileEditor/courseTemplate'),
  );
  config.fileEditorUseGit = true;
  config.chunksGenerator = true;
  await helperServer.before(fixture.courseLiveDir)();
});

afterAll(async () => {
  try {
    await helperServer.after();
  } finally {
    await fs.remove(fixture.baseDir);
  }
});

it('creates and copies questions without loading the course and matches full sync', async () => {
  const course = await selectCourseById('1');
  const user = await selectUserById('1');
  const locals = {
    course: await selectCourseById(course.id),
    user,
    authz_data: { has_course_permission_edit: true, authn_user: user },
  };
  const sourceQid = 'test/question';
  const editors = [
    new QuestionAddEditor({ locals, qid: 'new-question', title: 'New question' }),
    new QuestionCopyEditor({
      locals,
      from_course: course,
      from_qid: sourceQid,
      from_path: path.join(course.path, 'questions', sourceQid),
      is_transfer: false,
    }),
  ];
  const load = vi.spyOn(courseDB, 'loadFullCourse');
  try {
    for (const editor of editors) {
      await recordSuccessfulCourseSync(course.id, {
        commitHash: await updateCourseCommitHash(course),
        version: CURRENT_SYNC_VERSION,
        chunksGenerated: true,
      });

      await editor.executeWithServerJob(await editor.prepareServerJob());
      const question = await selectQuestionByUuid({ course_id: course.id, uuid: editor.uuid });
      assert.isNotNull(question.number);
      assert.isNotNull(question.topic_id);
      assert.equal(load.mock.calls.length, 0);
      const targeted = await captureDatabaseSnapshot();
      await syncCourseData(course.path);
      const full = await captureDatabaseSnapshot();
      for (const table of Object.keys(full) as (keyof typeof full)[]) {
        assert.sameDeepMembers<unknown>(full[table], targeted[table]);
      }
      load.mockClear();
    }
  } finally {
    load.mockRestore();
  }
});
