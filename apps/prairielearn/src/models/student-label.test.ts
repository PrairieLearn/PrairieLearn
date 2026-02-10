import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import type { Enrollment } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { syncStudentLabels } from '../sync/fromDisk/studentLabels.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectAuditEvents } from './audit-event.js';
import { selectCourseInstanceById } from './course-instances.js';
import { ensureUncheckedEnrollment } from './enrollment.js';
import {
  addEnrollmentToStudentLabel,
  addEnrollmentsToStudentLabel,
  createStudentLabel,
  deleteStudentLabel,
  removeEnrollmentFromStudentLabel,
  removeEnrollmentsFromStudentLabel,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelById,
  selectStudentLabelsForEnrollment,
  selectStudentLabelsInCourseInstance,
  updateStudentLabelColor,
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

describe('Student Label Model', () => {
  beforeAll(async function () {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
  });

  afterAll(helperDb.after);

  describe('createStudentLabel', () => {
    it('creates student labels with unique ids', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label1 = await createStudentLabel({ courseInstanceId: '1', name: 'Label 1' });
        const label2 = await createStudentLabel({ courseInstanceId: '1', name: 'Label 2' });

        assert.notEqual(label1.id, label2.id);
        assert.equal(label1.course_instance_id, label2.course_instance_id);
        assert.equal(label1.name, 'Label 1');
        assert.equal(label2.name, 'Label 2');
      });
    });

    it('allows creating label with same name after deletion', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label1 = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });
        await deleteStudentLabel(label1);

        const label2 = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });

        assert.notEqual(label1.id, label2.id);
        assert.equal(label2.name, 'Test Label');
      });
    });
  });

  describe('updateStudentLabelColor', () => {
    it('updates color and returns updated label', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label = await createStudentLabel({
          courseInstanceId: '1',
          name: 'Color Label',
          color: 'gray1',
        });
        assert.equal(label.color, 'gray1');

        const updated = await updateStudentLabelColor(label, 'red1');
        assert.equal(updated.id, label.id);
        assert.equal(updated.color, 'red1');
        assert.equal(updated.name, 'Color Label');
      });
    });
  });

  describe('selectStudentLabelsInCourseInstance', () => {
    it('returns all labels for a course instance', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        // Use course instance 2 which has no pre-existing labels
        const courseInstance = await selectCourseInstanceById('2');

        // Empty initially (no pre-existing labels in course instance 2)
        assert.isEmpty(await selectStudentLabelsInCourseInstance(courseInstance));

        await createStudentLabel({ courseInstanceId: '2', name: 'Label A' });
        await createStudentLabel({ courseInstanceId: '2', name: 'Label B' });
        const labelToDelete = await createStudentLabel({ courseInstanceId: '2', name: 'Label C' });

        await deleteStudentLabel(labelToDelete);

        const labels = await selectStudentLabelsInCourseInstance(courseInstance);
        assert.equal(labels.length, 2);
        assert.equal(labels[0].name, 'Label A');
        assert.equal(labels[1].name, 'Label B');
      });
    });
  });

  describe('selectStudentLabelById', () => {
    it('returns student label by id', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const courseInstance = await selectCourseInstanceById('1');
        const createdLabel = await createStudentLabel({
          courseInstanceId: '1',
          name: 'Test Label',
        });

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

        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });
        await deleteStudentLabel(label);

        await expect(
          selectStudentLabelById({ id: label.id, courseInstance }),
        ).rejects.toThrowError();
      });
    });

    it('throws 403 when label does not belong to course instance', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });
        // Use course instance 2 (the 'public' course instance in testCourse)
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
          }),
        ).rejects.toThrowError();
      });
    });
  });

  describe('addEnrollmentToStudentLabel', () => {
    it('adds label to enrollment and returns null on duplicate', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });

        const result = await addEnrollmentToStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        assert.isNotNull(result);
        assert.equal(result.enrollment_id, enrollment.id);
        assert.equal(result.student_label_id, label.id);

        // Adding again returns null
        const duplicate = await addEnrollmentToStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });
        assert.isNull(duplicate);
      });
    });
  });

  describe('removeEnrollmentFromStudentLabel', () => {
    it('removes label from enrollment', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });

        await addEnrollmentToStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });
        await removeEnrollmentFromStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        assert.isEmpty(await selectEnrollmentsInStudentLabel(label));
      });
    });
  });

  describe('selectEnrollmentsInStudentLabel', () => {
    it('returns enrollments that have the label', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });

        // Empty initially
        assert.isEmpty(await selectEnrollmentsInStudentLabel(label));

        const enrollment1 = await createEnrollment();
        const enrollment2 = await createEnrollment();

        await addEnrollmentToStudentLabel({
          enrollment: enrollment1,
          label,
          authzData: dangerousFullSystemAuthz(),
        });
        await addEnrollmentToStudentLabel({
          enrollment: enrollment2,
          label,
          authzData: dangerousFullSystemAuthz(),
        });

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

        // Empty initially
        assert.isEmpty(await selectStudentLabelsForEnrollment(enrollment));

        const label1 = await createStudentLabel({ courseInstanceId: '1', name: 'Label A' });
        const label2 = await createStudentLabel({ courseInstanceId: '1', name: 'Label B' });

        await addEnrollmentToStudentLabel({
          enrollment,
          label: label1,
          authzData: dangerousFullSystemAuthz(),
        });
        await addEnrollmentToStudentLabel({
          enrollment,
          label: label2,
          authzData: dangerousFullSystemAuthz(),
        });

        const labels = await selectStudentLabelsForEnrollment(enrollment);
        assert.equal(labels.length, 2);
        assert.isTrue(labels.some((l) => l.id === label1.id));
        assert.isTrue(labels.some((l) => l.id === label2.id));

        // Excludes deleted labels (cascade delete removes enrollments too)
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
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });

        await addEnrollmentToStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        const auditEvents = await selectAuditEvents({
          subject_user_id: enrollment.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

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
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });

        // First add
        await addEnrollmentToStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        // Second add (duplicate)
        const duplicate = await addEnrollmentToStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });
        assert.isNull(duplicate);

        const auditEvents = await selectAuditEvents({
          subject_user_id: enrollment.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

        // Should only have one audit event (from the first add)
        assert.equal(auditEvents.length, 1);
      });
    });

    it('creates audit event when removing enrollment from label', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const enrollment = await createEnrollment();
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Test Label' });

        await addEnrollmentToStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        await removeEnrollmentFromStudentLabel({
          enrollment,
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        const auditEvents = await selectAuditEvents({
          subject_user_id: enrollment.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

        // Should have 2 events: insert and delete
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
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Bulk Label' });

        await addEnrollmentsToStudentLabel({
          enrollments: [enrollment1, enrollment2],
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        const auditEvents1 = await selectAuditEvents({
          subject_user_id: enrollment1.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

        const auditEvents2 = await selectAuditEvents({
          subject_user_id: enrollment2.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

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
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Bulk Label' });

        await addEnrollmentsToStudentLabel({
          enrollments: [enrollment1, enrollment2],
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        await removeEnrollmentsFromStudentLabel({
          enrollments: [enrollment1, enrollment2],
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        const auditEvents1 = await selectAuditEvents({
          subject_user_id: enrollment1.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

        const auditEvents2 = await selectAuditEvents({
          subject_user_id: enrollment2.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

        // Each enrollment should have 2 events: insert and delete
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
        const label = await createStudentLabel({ courseInstanceId: '1', name: 'Bulk Label' });

        // First add enrollment1
        await addEnrollmentToStudentLabel({
          enrollment: enrollment1,
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        // Bulk add both (enrollment1 is duplicate)
        await addEnrollmentsToStudentLabel({
          enrollments: [enrollment1, enrollment2],
          label,
          authzData: dangerousFullSystemAuthz(),
        });

        const auditEvents1 = await selectAuditEvents({
          subject_user_id: enrollment1.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

        const auditEvents2 = await selectAuditEvents({
          subject_user_id: enrollment2.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: label.course_instance_id,
        });

        // enrollment1 should only have 1 event (from the first individual add)
        assert.equal(auditEvents1.length, 1);

        // enrollment2 should have 1 event (from the bulk add)
        assert.equal(auditEvents2.length, 1);
        assert.equal(auditEvents2[0].action, 'insert');
      });
    });

    it('creates audit events when label is deleted via sync', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const courseInstance = await selectCourseInstanceById('1');

        // Create label via sync with initial JSON
        await syncStudentLabels(courseInstance, [{ name: 'SyncLabel', color: 'red1' }], null);

        // Get the created label
        const labels = await selectStudentLabelsInCourseInstance(courseInstance);
        const syncLabel = labels.find((l) => l.name === 'SyncLabel');
        assert.isDefined(syncLabel);

        // Add enrollments to the label
        const enrollment1 = await createEnrollment();
        const enrollment2 = await createEnrollment();

        await addEnrollmentToStudentLabel({
          enrollment: enrollment1,
          label: syncLabel,
          authzData: dangerousFullSystemAuthz(),
        });
        await addEnrollmentToStudentLabel({
          enrollment: enrollment2,
          label: syncLabel,
          authzData: dangerousFullSystemAuthz(),
        });

        // Remove label by syncing without it
        await syncStudentLabels(courseInstance, [], null);

        // Verify audit events created for each enrollment
        const auditEvents1 = await selectAuditEvents({
          subject_user_id: enrollment1.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: '1',
        });

        const auditEvents2 = await selectAuditEvents({
          subject_user_id: enrollment2.user_id!,
          table_names: ['student_label_enrollments'],
          course_instance_id: '1',
        });

        // Should have 2 events each: insert and delete
        assert.equal(auditEvents1.length, 2);
        const deleteEvent1 = auditEvents1.find((e) => e.action === 'delete');
        assert.isDefined(deleteEvent1);
        assert.equal(deleteEvent1.action_detail, 'enrollment_removed');
        assert.deepEqual(deleteEvent1.context, { label_name: 'SyncLabel' });

        assert.equal(auditEvents2.length, 2);
        const deleteEvent2 = auditEvents2.find((e) => e.action === 'delete');
        assert.isDefined(deleteEvent2);
        assert.equal(deleteEvent2.action_detail, 'enrollment_removed');
        assert.deepEqual(deleteEvent2.context, { label_name: 'SyncLabel' });
      });
    });
  });
});
