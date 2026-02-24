import crypto from 'node:crypto';

import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import type { Enrollment, StudentLabel } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import type { ColorJson } from '../schemas/infoCourse.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectAuditEvents } from './audit-event.js';
import { selectCourseInstanceById } from './course-instances.js';
import { ensureUncheckedEnrollment } from './enrollment.js';
import {
  addLabelToEnrollment,
  addLabelToEnrollments,
  createStudentLabel,
  deleteStudentLabel,
  removeLabelFromEnrollment,
  removeLabelFromEnrollments,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelById,
  selectStudentLabelsForEnrollment,
  selectStudentLabelsInCourseInstance,
  updateStudentLabel,
} from './student-label.js';

let enrollmentCounter = 0;

async function createEnrollment(courseInstanceId = '1'): Promise<Enrollment> {
  enrollmentCounter++;
  const uid = `test${enrollmentCounter}@example.com`;
  const user = await getOrCreateUser({
    uid,
    name: `Test User ${enrollmentCounter}`,
    uin: uid,
    email: uid,
  });
  const courseInstance = await selectCourseInstanceById(courseInstanceId);
  const enrollment = await ensureUncheckedEnrollment({
    userId: user.id,
    courseInstance,
    requiredRole: ['System'],
    authzData: dangerousFullSystemAuthz(),
    actionDetail: 'implicit_joined',
  });
  assert.isNotNull(enrollment);
  assert.isNotNull(enrollment.user_id);
  return enrollment;
}

async function createTestLabel(
  name: string,
  { courseInstanceId = '1', color = 'gray1' as ColorJson, uuid = crypto.randomUUID() } = {},
) {
  const courseInstance = await selectCourseInstanceById(courseInstanceId);
  return createStudentLabel({ courseInstance, uuid, name, color });
}

async function addToLabel(enrollment: Enrollment, label: StudentLabel) {
  return addLabelToEnrollment({
    enrollment,
    label,
    authzData: dangerousFullSystemAuthz(),
  });
}

async function removeFromLabel(enrollment: Enrollment, label: StudentLabel) {
  return removeLabelFromEnrollment({
    enrollment,
    label,
    authzData: dangerousFullSystemAuthz(),
  });
}

async function bulkAddToLabel(enrollments: Enrollment[], label: StudentLabel) {
  return addLabelToEnrollments({
    enrollments,
    label,
    authzData: dangerousFullSystemAuthz(),
  });
}

async function bulkRemoveFromLabel(enrollments: Enrollment[], label: StudentLabel) {
  return removeLabelFromEnrollments({
    enrollments,
    label,
    authzData: dangerousFullSystemAuthz(),
  });
}

async function getLabelAuditEvents(enrollment: Enrollment, courseInstanceId: string) {
  return selectAuditEvents({
    subject_user_id: enrollment.user_id!,
    table_names: ['student_label_enrollments'],
    course_instance_id: courseInstanceId,
  });
}

describe('Student Label Model', () => {
  beforeAll(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
  });

  afterAll(helperDb.after);

  describe('createStudentLabel', () => {
    it('creates student labels with unique ids', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label1 = await createTestLabel('Label 1');
        const label2 = await createTestLabel('Label 2');

        assert.notEqual(label1.id, label2.id);
        assert.equal(label1.course_instance_id, label2.course_instance_id);
        assert.equal(label1.name, 'Label 1');
        assert.equal(label2.name, 'Label 2');
      });
    });

    it('allows creating label with same name after deletion', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label1 = await createTestLabel('Test Label');
        await deleteStudentLabel(label1);

        const label2 = await createTestLabel('Test Label');

        assert.notEqual(label1.id, label2.id);
        assert.equal(label2.name, 'Test Label');
      });
    });
  });

  describe('updateStudentLabel', () => {
    it('updates name and color and returns updated label', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label = await createTestLabel('Color Label');
        assert.equal(label.color, 'gray1');

        const updated = await updateStudentLabel({ label, name: 'Renamed Label', color: 'red1' });
        assert.equal(updated.id, label.id);
        assert.equal(updated.color, 'red1');
        assert.equal(updated.name, 'Renamed Label');
      });
    });
  });

  describe('selectStudentLabelsInCourseInstance', () => {
    it('returns all labels for a course instance', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const courseInstance = await selectCourseInstanceById('1');
        const initialLabels = await selectStudentLabelsInCourseInstance(courseInstance);
        for (const label of initialLabels) {
          await deleteStudentLabel(label);
        }

        await createTestLabel('Label A');
        await createTestLabel('Label B');
        const labelToDelete = await createTestLabel('Label C');
        await deleteStudentLabel(labelToDelete);

        const labels = await selectStudentLabelsInCourseInstance(courseInstance);
        assert.equal(labels.length, 2);
        assert.isTrue(labels.some((l) => l.name === 'Label A'));
        assert.isTrue(labels.some((l) => l.name === 'Label B'));
        assert.isFalse(labels.some((l) => l.name === 'Label C'));
      });
    });
  });

  describe('selectStudentLabelById', () => {
    it('returns student label by id', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const courseInstance = await selectCourseInstanceById('1');
        const createdLabel = await createTestLabel('Test Label');

        const retrievedLabel = await selectStudentLabelById({
          id: createdLabel.id,
          courseInstance,
        });
        assert.equal(retrievedLabel.id, createdLabel.id);
        assert.equal(retrievedLabel.name, 'Test Label');
      });
    });

    it('throws error for non-existent or deleted labels', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const courseInstance = await selectCourseInstanceById('1');

        await expect(
          selectStudentLabelById({ id: '999999', courseInstance }),
        ).rejects.toThrowError();

        const label = await createTestLabel('Test Label');
        await deleteStudentLabel(label);

        await expect(
          selectStudentLabelById({ id: label.id, courseInstance }),
        ).rejects.toThrowError();
      });
    });

    it('throws 403 when label does not belong to course instance', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label = await createTestLabel('Test Label');
        const courseInstance2 = await selectCourseInstanceById('2');

        await expect(
          selectStudentLabelById({
            id: label.id,
            courseInstance: courseInstance2,
          }),
        ).rejects.toThrowError(
          expect.objectContaining({
            status: 403,
          }),
        );
      });
    });
  });

  describe('deleteStudentLabel', () => {
    it('throws error when deleting non-existent label', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await expect(
          deleteStudentLabel({
            id: '999999',
            course_instance_id: '1',
            name: 'nonexistent',
            color: 'gray1',
            uuid: crypto.randomUUID(),
          }),
        ).rejects.toThrowError();
      });
    });
  });

  describe('addLabelToEnrollment', () => {
    it('adds label to enrollment and returns null on duplicate', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        const label = await createTestLabel('Test Label');

        const result = await addToLabel(enrollment, label);

        assert.isNotNull(result);
        assert.equal(result.enrollment_id, enrollment.id);
        assert.equal(result.student_label_id, label.id);

        const duplicate = await addToLabel(enrollment, label);
        assert.isNull(duplicate);
      });
    });
  });

  describe('removeLabelFromEnrollment', () => {
    it('removes label from enrollment', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        const label = await createTestLabel('Test Label');

        await addToLabel(enrollment, label);
        await removeFromLabel(enrollment, label);

        assert.isEmpty(await selectEnrollmentsInStudentLabel(label));
      });
    });
  });

  describe('selectEnrollmentsInStudentLabel', () => {
    it('returns enrollments that have the label', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label = await createTestLabel('Test Label');
        assert.isEmpty(await selectEnrollmentsInStudentLabel(label));

        const enrollment1 = await createEnrollment();
        const enrollment2 = await createEnrollment();

        await addToLabel(enrollment1, label);
        await addToLabel(enrollment2, label);

        const enrollments = await selectEnrollmentsInStudentLabel(label);
        assert.equal(enrollments.length, 2);
        assert.isTrue(enrollments.some((e) => e.id === enrollment1.id));
        assert.isTrue(enrollments.some((e) => e.id === enrollment2.id));
      });
    });
  });

  describe('selectStudentLabelsForEnrollment', () => {
    it('returns labels for enrollment', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        assert.isEmpty(await selectStudentLabelsForEnrollment(enrollment));

        const label1 = await createTestLabel('Label A');
        const label2 = await createTestLabel('Label B');

        await addToLabel(enrollment, label1);
        await addToLabel(enrollment, label2);

        const labels = await selectStudentLabelsForEnrollment(enrollment);
        assert.equal(labels.length, 2);
        assert.isTrue(labels.some((l) => l.id === label1.id));
        assert.isTrue(labels.some((l) => l.id === label2.id));

        await deleteStudentLabel(label1);
        const labelsAfterDelete = await selectStudentLabelsForEnrollment(enrollment);
        assert.equal(labelsAfterDelete.length, 1);
        assert.equal(labelsAfterDelete[0].id, label2.id);
      });
    });
  });

  describe('Audit Events for Label Enrollments', () => {
    it('creates audit event when adding enrollment to label', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        const label = await createTestLabel('Test Label');

        await addToLabel(enrollment, label);

        const auditEvents = await getLabelAuditEvents(enrollment, label.course_instance_id);

        assert.equal(auditEvents.length, 1);
        assert.equal(auditEvents[0].action, 'insert');
        assert.equal(auditEvents[0].action_detail, 'enrollment_added');
        assert.equal(auditEvents[0].table_name, 'student_label_enrollments');
        assert.equal(auditEvents[0].subject_user_id, enrollment.user_id);
        assert.equal(auditEvents[0].enrollment_id, enrollment.id);
        assert.deepEqual(auditEvents[0].context, { label_name: label.name });
        assert.isNotNull(auditEvents[0].new_row);
        assert.isNull(auditEvents[0].old_row);
      });
    });

    it('does NOT create audit event when adding duplicate enrollment', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        const label = await createTestLabel('Test Label');

        await addToLabel(enrollment, label);

        const duplicate = await addToLabel(enrollment, label);
        assert.isNull(duplicate);

        const auditEvents = await getLabelAuditEvents(enrollment, label.course_instance_id);
        assert.equal(auditEvents.length, 1);
      });
    });

    it('creates audit event when removing enrollment from label', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        const label = await createTestLabel('Test Label');

        await addToLabel(enrollment, label);
        await removeFromLabel(enrollment, label);

        const auditEvents = await getLabelAuditEvents(enrollment, label.course_instance_id);
        assert.equal(auditEvents.length, 2);

        const deleteEvent = auditEvents.find((e) => e.action === 'delete');
        assert.isDefined(deleteEvent);
        assert.equal(deleteEvent.action_detail, 'enrollment_removed');
        assert.equal(deleteEvent.table_name, 'student_label_enrollments');
        assert.equal(deleteEvent.subject_user_id, enrollment.user_id);
        assert.equal(deleteEvent.enrollment_id, enrollment.id);
        assert.deepEqual(deleteEvent.context, { label_name: label.name });
        assert.isNotNull(deleteEvent.old_row);
        assert.isNull(deleteEvent.new_row);
      });
    });

    it('creates multiple audit events when bulk adding', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment1 = await createEnrollment();
        const enrollment2 = await createEnrollment();
        const label = await createTestLabel('Bulk Label');

        await bulkAddToLabel([enrollment1, enrollment2], label);

        const auditEvents1 = await getLabelAuditEvents(enrollment1, label.course_instance_id);
        const auditEvents2 = await getLabelAuditEvents(enrollment2, label.course_instance_id);

        assert.equal(auditEvents1.length, 1);
        assert.equal(auditEvents1[0].action, 'insert');
        assert.equal(auditEvents1[0].action_detail, 'enrollment_added');
        assert.deepEqual(auditEvents1[0].context, { label_name: label.name });

        assert.equal(auditEvents2.length, 1);
        assert.equal(auditEvents2[0].action, 'insert');
        assert.equal(auditEvents2[0].action_detail, 'enrollment_added');
        assert.deepEqual(auditEvents2[0].context, { label_name: label.name });
      });
    });

    it('creates multiple audit events when bulk removing', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment1 = await createEnrollment();
        const enrollment2 = await createEnrollment();
        const label = await createTestLabel('Bulk Label');

        await bulkAddToLabel([enrollment1, enrollment2], label);
        await bulkRemoveFromLabel([enrollment1, enrollment2], label);

        const auditEvents1 = await getLabelAuditEvents(enrollment1, label.course_instance_id);
        const auditEvents2 = await getLabelAuditEvents(enrollment2, label.course_instance_id);

        assert.equal(auditEvents1.length, 2);
        const deleteEvent1 = auditEvents1.find((e) => e.action === 'delete');
        assert.isDefined(deleteEvent1);
        assert.equal(deleteEvent1.action_detail, 'enrollment_removed');
        assert.deepEqual(deleteEvent1.context, { label_name: label.name });

        assert.equal(auditEvents2.length, 2);
        const deleteEvent2 = auditEvents2.find((e) => e.action === 'delete');
        assert.isDefined(deleteEvent2);
        assert.equal(deleteEvent2.action_detail, 'enrollment_removed');
        assert.deepEqual(deleteEvent2.context, { label_name: label.name });
      });
    });

    it('bulk add only creates audit events for new enrollments', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment1 = await createEnrollment();
        const enrollment2 = await createEnrollment();
        const label = await createTestLabel('Bulk Label');

        // First add enrollment1
        await addToLabel(enrollment1, label);

        // Bulk add both (enrollment1 is duplicate)
        await bulkAddToLabel([enrollment1, enrollment2], label);

        const auditEvents1 = await getLabelAuditEvents(enrollment1, label.course_instance_id);
        const auditEvents2 = await getLabelAuditEvents(enrollment2, label.course_instance_id);

        assert.equal(auditEvents1.length, 1);
        assert.equal(auditEvents2.length, 1);
        assert.equal(auditEvents2[0].action, 'insert');
      });
    });
  });
});
