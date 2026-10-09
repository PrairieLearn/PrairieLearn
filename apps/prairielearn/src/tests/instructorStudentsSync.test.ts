import { afterAll, assert, beforeAll, describe, test, vi } from 'vitest';
import { z } from 'zod';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import type { CourseInstance, StudentLabel } from '../lib/db-types.js';
import { selectAuditEventsByEnrollmentId } from '../models/audit-event.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { inviteStudentByUid, selectOptionalEnrollmentByUid } from '../models/enrollment.js';
import * as studentLabels from '../models/student-label.js';
import type { SyncCsv } from '../pages/instructorStudents/instructorStudents.shared.js';
import { createCourseInstanceTrpcClient } from '../trpc/courseInstance/client.js';

import * as helperServer from './helperServer.js';

const path = '/pl/course_instance/1/instructor/instance_admin/students';
const authzData = dangerousFullSystemAuthz();

describe('CSV student synchronization', { concurrent: false }, () => {
  let courseInstance: CourseInstance;
  let labels: StudentLabel[];
  beforeAll(helperServer.before());
  afterAll(helperServer.after);
  beforeAll(async () => {
    courseInstance = await selectCourseInstanceById('1');
    const available = await studentLabels.selectStudentLabelsInCourseInstance(courseInstance);
    labels = ['Section A', 'Extra time'].map((name) => {
      const label = available.find((label) => label.name === name);
      assert.isDefined(label);
      return label;
    });
  });

  async function preview(text: string) {
    const client = createCourseInstanceTrpcClient({
      csrfToken: generatePrefixCsrfToken(
        { url: '/pl/course_instance/1/instructor/trpc', authn_user_id: '1' },
        config.secretKey,
      ),
      courseInstanceId: '1',
      urlBase: `http://localhost:${config.serverPort}`,
    });
    const { preview } = await client.studentSync.preview.mutate({ text });
    return {
      toInvite: preview.toInvite.map((item) => item.uid),
      csv: {
        text,
        labelUpdates: [...preview.toInvite, ...preview.toUpdateLabels].flatMap((item) =>
          item.labelUpdate ? [item.labelUpdate] : [],
        ),
      },
    };
  }

  async function submit(request: { toInvite: string[]; csv: SyncCsv }) {
    return await fetch(`http://localhost:${config.serverPort}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        __action: 'sync_students',
        __csrf_token: generatePrefixCsrfToken({ url: path, authn_user_id: '1' }, config.secretKey),
        toCancelInvitation: [],
        toRemove: [],
        ...request,
      }),
    });
  }

  async function finish(
    request: { toInvite: string[]; csv: SyncCsv },
    status: 'Success' | 'Error' = 'Success',
  ) {
    const response = await submit(request);
    assert.equal(response.status, 200);
    const { job_sequence_id } = z
      .object({ job_sequence_id: z.string() })
      .parse(await response.json());
    await helperServer.waitForJobSequenceStatus(job_sequence_id, status);
  }

  async function find(uid: string) {
    return await selectOptionalEnrollmentByUid({
      uid,
      courseInstance,
      authzData,
      requiredRole: ['System'],
    });
  }

  test('preserves labels without the labels column and clears them with empty cells', async () => {
    const uid = 'csv-clear@example.com';
    const enrollment = await inviteStudentByUid({
      uid,
      courseInstance,
      authzData,
      requiredRole: ['System'],
    });
    await studentLabels.addLabelToEnrollment({ enrollment, label: labels[0], authzData });
    await finish(await preview(`uid\n${uid}`));
    assert.deepEqual(await studentLabels.selectStudentLabelsForEnrollment(enrollment), [labels[0]]);
    await finish(await preview(`uid,labels\n${uid},`));
    assert.isEmpty(await studentLabels.selectStudentLabelsForEnrollment(enrollment));
    assert.deepEqual(await find(uid), enrollment);
  });

  test('rejects tampered labels before starting a job', async () => {
    const request = await preview('uid,labels\ncsv-invalid@example.com,Section A');
    request.csv.labelUpdates[0].labelIds = [labels[1].id];
    assert.equal((await submit(request)).status, 400);
    assert.isNull(await find('csv-invalid@example.com'));
  });

  test('rejects stale label previews without overwriting a newer assignment', async () => {
    const uid = 'csv-stale@example.com';
    const enrollment = await inviteStudentByUid({
      uid,
      courseInstance,
      authzData,
      requiredRole: ['System'],
    });
    const request = await preview(`uid,labels\n${uid},Section A`);
    await studentLabels.addLabelToEnrollment({ enrollment, label: labels[1], authzData });
    await finish(request, 'Error');
    assert.deepEqual(await studentLabels.selectStudentLabelsForEnrollment(enrollment), [labels[1]]);
  });

  test.each(['new', 'existing'] as const)(
    'rolls back failed %s student label changes and continues the batch',
    async (kind) => {
      const uid = `csv-rollback-${kind}@example.com`;
      if (kind === 'existing') {
        const enrollment = await inviteStudentByUid({
          uid,
          courseInstance,
          authzData,
          requiredRole: ['System'],
        });
        await studentLabels.addLabelToEnrollment({ enrollment, label: labels[0], authzData });
      }
      const original = await find(uid);
      const auditBefore = original
        ? await selectAuditEventsByEnrollmentId({
            enrollment_id: original.id,
            table_names: ['student_label_enrollments'],
          })
        : [];
      const request = await preview(
        `uid,labels\n${uid},Extra time\ncsv-after-${kind}@example.com,Section A`,
      );
      const addLabel = studentLabels.addLabelToEnrollment;
      const spy = vi
        .spyOn(studentLabels, 'addLabelToEnrollment')
        .mockImplementation(async (args) => {
          if (args.enrollment.pending_uid === uid) throw new Error('Label assignment failed');
          return await addLabel(args);
        });
      try {
        await finish(request, 'Error');
        assert.deepEqual(await find(uid), original);
        if (kind === 'existing') {
          assert.isNotNull(original);
          assert.deepEqual(
            await selectAuditEventsByEnrollmentId({
              enrollment_id: original.id,
              table_names: ['student_label_enrollments'],
            }),
            auditBefore,
          );
          assert.deepEqual(await studentLabels.selectStudentLabelsForEnrollment(original), [
            labels[0],
          ]);
        }
        const successful = await find(`csv-after-${kind}@example.com`);
        assert.isNotNull(successful);
        assert.deepEqual(await studentLabels.selectStudentLabelsForEnrollment(successful), [
          labels[0],
        ]);
      } finally {
        spy.mockRestore();
      }
    },
  );
});
