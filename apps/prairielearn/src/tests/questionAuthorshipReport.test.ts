import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);
const siteUrl = `http://localhost:${config.serverPort}`;

describe('Question authorship report', () => {
  let authnUserId: string;

  beforeAll(helperServer.before());
  beforeAll(async () => {
    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
    });
    authnUserId = instructor.id;
    await getOrCreateUser({ uid: 'external', name: 'Private name', uin: null });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: instructor.uid,
      course_role: 'Previewer',
      authn_user_id: instructor.id,
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: instructor.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: instructor.id,
    });
    await execute(sql.set_authors, { author_uid: instructor.uid });
    await execute(sql.insert_copies);
    await execute(sql.connect_copies);
  });
  afterAll(helperServer.after);

  function client(courseRole: 'Previewer' | 'None') {
    return createCourseTrpcClient({
      courseId: '1',
      courseInstanceId: '1',
      urlBase: siteUrl,
      csrfToken: generatePrefixCsrfToken(
        { url: getCourseTrpcUrl('1', '1'), authn_user_id: authnUserId },
        config.secretKey,
      ),
      extraHeaders: {
        cookie: `pl_test_user=test_instructor; pl2_requested_course_role=${courseRole}; pl2_requested_course_instance_role=Student Data Viewer`,
      },
    });
  }

  it('reports deduplicated adoption and local author names without downstream details', async () => {
    const report = await client('Previewer').questions.authorshipReport.query();
    assert.deepEqual(
      report.map(({ uid, display_name }) => [uid, display_name]),
      [
        ['external', 'external'],
        ['instructor@example.com', 'Instructor User'],
      ],
    );
    const [external, staff] = report;
    assert.deepEqual(external.questions, [staff.questions[0]]);
    // QID, deleted, downstream courses, downstream institutions.
    assert.deepEqual(
      staff.questions.map((q) => [
        q.qid,
        q.deleted_at !== null,
        q.downstream_course_count,
        q.downstream_institution_count,
      ]),
      [
        ['addNumbers', true, 2, 1],
        ['addVectors', false, 0, 0],
      ],
    );
    assert.sameMembers(Object.keys(staff.questions[0]), [
      'id',
      'qid',
      'title',
      'deleted_at',
      'draft',
      'provenance_status',
      'downstream_course_count',
      'downstream_institution_count',
    ]);
  });

  it('denies access with only course-instance permissions', async () => {
    await expect(client('None').questions.authorshipReport.query()).rejects.toMatchObject({
      data: { code: 'FORBIDDEN', httpStatus: 403 },
    });
  });
});
