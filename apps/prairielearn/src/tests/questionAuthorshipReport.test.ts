import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import { getCourseQuestionAuthorshipReport } from '../lib/question-authorship-report.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { selectQuestionCopyAdoption } from '../models/question.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperDb from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);
const courseId = '1';
const siteUrl = `http://localhost:${config.serverPort}`;

async function insertCourse(name: string) {
  return await queryScalar(sql.insert_course, { name }, IdSchema);
}

async function insertQuestion({
  course_id = courseId,
  qid,
  authors = [],
  source_id = null,
  declared_source = null,
  deleted = false,
}: {
  course_id?: string;
  qid: string;
  authors?: string[];
  source_id?: string | null;
  declared_source?: string | null;
  deleted?: boolean;
}) {
  return await queryScalar(
    sql.insert_question,
    { course_id, qid, authors, source_id, declared_source, deleted },
    IdSchema,
  );
}

describe('Question authorship reports', () => {
  let instructor: User;

  beforeAll(helperServer.before());
  beforeAll(async () => {
    await execute(sql.clear_authors);
    instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
    });
    await insertCoursePermissionsByUserUid({
      course_id: courseId,
      uid: instructor.uid,
      course_role: 'Owner',
      authn_user_id: instructor.id,
    });
    await insertCourseInstancePermissions({
      course_id: courseId,
      course_instance_id: '1',
      user_id: instructor.id,
      course_instance_role: 'Student Data Editor',
      authn_user_id: instructor.id,
    });
  });
  afterAll(helperServer.after);

  it('counts branching and indirect copies once per external course, for multiple sources', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const b = await insertCourse('B');
      const c = await insertCourse('C');
      const d = await insertCourse('D');
      const root = await insertQuestion({ qid: 'root' });
      const b1 = await insertQuestion({ course_id: b, qid: 'b1', source_id: root });
      await insertQuestion({ course_id: b, qid: 'b2', source_id: root });
      const c1 = await insertQuestion({ course_id: c, qid: 'c1', source_id: b1 });
      const local = await insertQuestion({ qid: 'returned-copy', source_id: c1 });
      await insertQuestion({ course_id: d, qid: 'd1', source_id: local });
      const adoption = await selectQuestionCopyAdoption([root, c1]);
      assert.sameDeepMembers(adoption, [
        { question_id: root, downstream_course_count: 3 },
        { question_id: c1, downstream_course_count: 2 },
      ]);
    });
  });

  it('terminates cycles and self-references while retaining copies beyond the cycle', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const b = await insertCourse('B');
      const c = await insertCourse('C');
      const root = await insertQuestion({ qid: 'cyclic-root' });
      const b1 = await insertQuestion({ course_id: b, qid: 'b1', source_id: root });
      await execute(sql.update_source, { question_id: root, source_id: b1 });
      await insertQuestion({ course_id: c, qid: 'c1', source_id: b1 });
      const self = await insertQuestion({ qid: 'self' });
      await execute(sql.update_source, { question_id: self, source_id: self });
      await insertQuestion({ course_id: b, qid: 'self-copy', source_id: self });

      assert.sameDeepMembers(await selectQuestionCopyAdoption([root, self]), [
        { question_id: root, downstream_course_count: 2 },
        { question_id: self, downstream_course_count: 1 },
      ]);
    });
  });

  it('includes deleted sources, intermediate copies, leaf copies, and courses', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const b = await insertCourse('B');
      const c = await insertCourse('C');
      const root = await insertQuestion({
        qid: 'deleted-root',
        authors: ['author'],
        deleted: true,
      });
      const b1 = await insertQuestion({ course_id: b, qid: 'b1', source_id: root, deleted: true });
      await insertQuestion({ course_id: c, qid: 'c1', source_id: b1, deleted: true });
      await execute(sql.delete_course, { course_id: b });

      const report = await getCourseQuestionAuthorshipReport(courseId);
      assert.lengthOf(report, 1);
      assert.lengthOf(report[0].questions, 1);
      assert.instanceOf(report[0].questions[0].deleted_at, Date);
      assert.equal(report[0].questions[0].downstream_course_count, 2);
    });
  });

  it('distinguishes absent and unresolved provenance and includes locally credited adaptations', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const b = await insertCourse('B');
      const upstream = await insertQuestion({ course_id: b, qid: 'upstream' });
      await insertQuestion({ qid: 'original', authors: ['author'] });
      await insertQuestion({
        qid: 'adapted',
        authors: ['author'],
        source_id: upstream,
      });
      const unresolved = await insertQuestion({
        qid: 'unresolved',
        authors: ['author'],
        declared_source:
          '00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001',
      });
      await insertQuestion({ course_id: b, qid: 'unresolved-copy', source_id: unresolved });
      const [author] = await getCourseQuestionAuthorshipReport(courseId);
      assert.deepEqual(
        author.questions.map(({ qid, provenance_status, downstream_course_count }) => ({
          qid,
          provenance_status,
          downstream_course_count,
        })),
        [
          {
            qid: 'adapted',
            provenance_status: 'resolved',
            downstream_course_count: 0,
          },
          {
            qid: 'original',
            provenance_status: 'absent',
            downstream_course_count: 0,
          },
          {
            qid: 'unresolved',
            provenance_status: 'unresolved',
            downstream_course_count: 1,
          },
        ],
      );
    });
  });

  describe('HTTP report endpoint', () => {
    let root: string;
    let localQuestion: string;

    beforeAll(async () => {
      const outsider = await getOrCreateUser({ uid: 'outsider', name: 'Private name', uin: null });
      root = await insertQuestion({ qid: 'http-root', authors: [instructor.uid, outsider.uid] });
      localQuestion = await insertQuestion({ qid: 'local', authors: [instructor.uid] });
      const downstreamCourseId = await insertCourse('Private downstream course');
      await insertCoursePermissionsByUserUid({
        course_id: downstreamCourseId,
        uid: outsider.uid,
        course_role: 'Owner',
        authn_user_id: instructor.id,
      });
      await insertQuestion({
        course_id: downstreamCourseId,
        qid: 'secret-copy',
        source_id: root,
        authors: ['downstream-author'],
      });
    });

    function client({ cookie, courseInstanceId }: { cookie: string; courseInstanceId?: string }) {
      return createCourseTrpcClient({
        csrfToken: generatePrefixCsrfToken(
          {
            url: getCourseTrpcUrl(courseId, courseInstanceId),
            authn_user_id: instructor.id,
          },
          config.secretKey,
        ),
        courseId,
        courseInstanceId,
        urlBase: siteUrl,
        extraHeaders: { cookie },
      });
    }

    it('groups local authors, resolves staff names, and exposes only counts for downstream copies', async () => {
      const report = await client({
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=Previewer; pl2_requested_course_instance_role=None',
      }).questions.authorshipReport.query();
      const rootQuestion = {
        id: root,
        qid: 'http-root',
        title: 'Report question http-root',
        deleted_at: null,
        draft: false,
        provenance_status: 'absent' as const,
        downstream_course_count: 1,
      };
      assert.deepEqual(report, [
        {
          uid: instructor.uid,
          display_name: 'Instructor User',
          questions: [
            rootQuestion,
            {
              id: localQuestion,
              qid: 'local',
              title: 'Report question local',
              deleted_at: null,
              draft: false,
              provenance_status: 'absent',
              downstream_course_count: 0,
            },
          ],
        },
        { uid: 'outsider', display_name: 'outsider', questions: [rootQuestion] },
      ]);
    });

    it('denies users with only course-instance permissions', async () => {
      const trpc = client({
        courseInstanceId: '1',
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Viewer',
      });
      await expect(trpc.questions.authorshipReport.query()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN', httpStatus: 403 },
      });
    });
  });
});
