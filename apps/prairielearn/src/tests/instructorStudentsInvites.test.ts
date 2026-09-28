import { afterAll, assert, beforeAll, describe, test, vi } from 'vitest';
import { z } from 'zod';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import type { CourseInstance, StudentLabel } from '../lib/db-types.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  ensureUncheckedEnrollment,
  inviteStudentByUid,
  selectOptionalEnrollmentByUid,
} from '../models/enrollment.js';
import * as studentLabels from '../models/student-label.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const studentsPath = '/pl/course_instance/1/instructor/instance_admin/students';
const authzData = dangerousFullSystemAuthz();

describe('Invite students with labels', { concurrent: false }, () => {
  let courseInstance: CourseInstance;
  let labels: StudentLabel[];

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  beforeAll(async () => {
    courseInstance = await selectCourseInstanceById('1');
    const availableLabels = await studentLabels.selectStudentLabelsInCourseInstance(courseInstance);
    labels = ['Section A', 'Extra time'].map((name) => {
      const label = availableLabels.find((label) => label.name === name);
      assert.isDefined(label);
      return label;
    });
  });

  async function invite(uids: string[], labelIds?: string[]) {
    return await fetch(`http://localhost:${config.serverPort}${studentsPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        __action: 'invite_uids',
        __csrf_token: generatePrefixCsrfToken(
          { url: studentsPath, authn_user_id: '1' },
          config.secretKey,
        ),
        uids: uids.join(','),
        labelIds,
      }),
    });
  }

  async function finishInvitation(response: Response) {
    assert.equal(response.status, 200);
    const { job_sequence_id } = z
      .object({ job_sequence_id: z.string() })
      .parse(await response.json());
    await helperServer.waitForJobSequenceSuccess(job_sequence_id);
  }

  async function findEnrollment(uid: string) {
    return await selectOptionalEnrollmentByUid({
      uid,
      courseInstance,
      authzData,
      requiredRole: ['System'],
    });
  }

  test('adds multiple labels to each pending invitation and deduplicates label IDs', async () => {
    const uids = ['label-invite-1@example.com', 'label-invite-2@example.com'];
    await finishInvitation(await invite(uids, [labels[0].id, labels[1].id, labels[0].id]));

    for (const uid of uids) {
      const enrollment = await findEnrollment(uid);
      assert.isNotNull(enrollment);
      assert.equal(enrollment.status, 'invited');
      assert.isNull(enrollment.user_id);
      assert.sameMembers(
        (await studentLabels.selectStudentLabelsForEnrollment(enrollment)).map((label) => label.id),
        labels.map((label) => label.id),
      );
    }
  });

  test('preserves invitations without label IDs', async () => {
    const uid = 'label-invite-none@example.com';
    await finishInvitation(await invite([uid]));
    const enrollment = await findEnrollment(uid);
    assert.isNotNull(enrollment);
    assert.equal(enrollment.status, 'invited');
    assert.isEmpty(await studentLabels.selectStudentLabelsForEnrollment(enrollment));
  });

  test('leaves existing invited and joined students and their labels unchanged', async () => {
    const pendingUid = 'label-invite-existing@example.com';
    const pending = await inviteStudentByUid({
      uid: pendingUid,
      courseInstance,
      authzData,
      requiredRole: ['System'],
    });
    const user = await getOrCreateUser({
      uid: 'label-invite-joined@example.com',
      name: 'Joined Student',
      uin: null,
    });
    await ensureUncheckedEnrollment({
      userId: user.id,
      courseInstance,
      authzData,
      requiredRole: ['System'],
      actionDetail: 'implicit_joined',
    });
    await studentLabels.addLabelToEnrollment({ enrollment: pending, label: labels[0], authzData });

    await finishInvitation(await invite([pendingUid, user.uid], [labels[1].id]));
    const stillPending = await findEnrollment(pendingUid);
    const joined = await findEnrollment(user.uid);
    assert.isNotNull(stillPending);
    assert.isNotNull(joined);
    assert.equal(stillPending.status, 'invited');
    assert.equal(joined.status, 'joined');
    assert.deepEqual(await studentLabels.selectStudentLabelsForEnrollment(stillPending), [
      labels[0],
    ]);
    assert.isEmpty(await studentLabels.selectStudentLabelsForEnrollment(joined));
  });

  test('rejects missing and cross-course-instance labels before inviting any students', async () => {
    const otherInstance = await selectCourseInstanceById('2');
    const otherLabel = await studentLabels.createStudentLabel({
      courseInstance: otherInstance,
      uuid: crypto.randomUUID(),
      name: 'Other instance',
      color: 'blue1',
    });
    for (const labelId of ['999999999', otherLabel.id]) {
      const uid = `label-invite-invalid-${labelId}@example.com`;
      const response = await invite([uid], [labels[0].id, labelId]);
      assert.equal(response.status, 400);
      assert.isNull(await findEnrollment(uid));
    }
  });

  test('rolls back the invitation and earlier labels when a label fails, then continues the batch', async () => {
    const failedUid = 'label-invite-rollback@example.com';
    const successfulUid = 'label-invite-after-failure@example.com';
    const addLabel = studentLabels.addLabelToEnrollment;
    const spy = vi
      .spyOn(studentLabels, 'addLabelToEnrollment')
      .mockImplementationOnce(addLabel)
      .mockRejectedValueOnce(new Error('Label assignment failed'));
    try {
      await finishInvitation(
        await invite(
          [failedUid, successfulUid],
          labels.map((label) => label.id),
        ),
      );
      assert.isNull(await findEnrollment(failedUid));
      const enrollment = await findEnrollment(successfulUid);
      assert.isNotNull(enrollment);
      assert.lengthOf(await studentLabels.selectStudentLabelsForEnrollment(enrollment), 2);
    } finally {
      spy.mockRestore();
    }
  });
});
