import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { insertAuditEvent, selectAuditEvents } from './audit-event.js';

describe('audit-event', () => {
  beforeEach(async function () {
    await helperDb.before();
    await helperCourse.syncCourse();
  });

  afterEach(async function () {
    await helperDb.after();
  });

  describe('insertAuditEvent', () => {
    it('inserts a basic audit event successfully', async () => {
      const user = await getOrCreateUser({
        uid: 'student@example.com',
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });

      const auditEvent = await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        action_detail: 'User created',
        context: { test: 'basic' },
      });

      assert.equal(auditEvent.action, 'insert');
      assert.equal(auditEvent.table_name, 'users');
      assert.equal(auditEvent.row_id, '1');
      assert.equal(auditEvent.subject_user_id, user.user_id);
      assert.equal(auditEvent.course_instance_id, '1');
      assert.equal(auditEvent.action_detail, 'User created');
      assert.deepEqual(auditEvent.context, { test: 'basic' });
      assert.instanceOf(auditEvent.date, Date);
      assert.typeOf(auditEvent.id, 'string');
    });

    it('uses default values for optional parameters', async () => {
      const user = await getOrCreateUser({
        uid: 'default@example.com',
        name: 'Default User',
        uin: 'default',
        email: 'default@example.com',
      });

      const auditEvent = await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: null,
        agent_user_id: null,
        subject_user_id: user.user_id,
        new_row: { test: 'default user data' },
      });

      assert.equal(auditEvent.action, 'insert');
      assert.equal(auditEvent.table_name, 'users');
      assert.equal(auditEvent.row_id, '1');
      assert.equal(auditEvent.subject_user_id, user.user_id);
      assert.equal(auditEvent.course_instance_id, null);
      assert.equal(auditEvent.action_detail, null);
      assert.deepEqual(auditEvent.context, {});
      assert.equal(auditEvent.old_row, null);
      assert.deepEqual(auditEvent.new_row, { test: 'default user data' });
      assert.equal(auditEvent.agent_authn_user_id, null);
      assert.equal(auditEvent.agent_user_id, null);
      // institution_id is inferred from the user, so it won't be null
      assert.typeOf(auditEvent.institution_id, 'string');
      assert.equal(auditEvent.course_id, null);
      assert.equal(auditEvent.assessment_id, null);
      assert.equal(auditEvent.assessment_instance_id, null);
      assert.equal(auditEvent.assessment_question_id, null);
      assert.equal(auditEvent.group_id, null);
      assert.instanceOf(auditEvent.date, Date);
      assert.typeOf(auditEvent.id, 'string');
    });
  });

  describe('selectAuditEvents', () => {
    it('throws error when both subject_user_id and agent_authn_user_id are provided', async () => {
      try {
        await selectAuditEvents({
          subject_user_id: '1',
          agent_authn_user_id: '1',
          table_names: ['users'],
          course_instance_id: '1',
        });
        assert.fail('Expected error to be thrown');
      } catch (error) {
        assert.match(
          error.message,
          /subject_user_id and agent_authn_user_id cannot both be provided/,
        );
      }
    });

    it('throws error when neither subject_user_id nor agent_authn_user_id are provided', async () => {
      try {
        await selectAuditEvents({
          table_names: ['users'],
          course_instance_id: '1',
        });
        assert.fail('Expected error to be thrown');
      } catch (error) {
        assert.match(error.message, /subject_user_id or agent_authn_user_id must be provided/);
      }
    });

    it('returns empty array when no audit events exist', async () => {
      const user = await getOrCreateUser({
        uid: 'student@example.com',
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });

      const result = await selectAuditEvents({
        subject_user_id: user.user_id,
        table_names: ['users'],
        course_instance_id: '1',
      });

      assert.deepEqual(result, []);
    });

    it('returns audit events for a single table name', async () => {
      const user = await getOrCreateUser({
        uid: 'student@example.com',
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });

      // Insert test audit events
      const auditEvent1 = await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        context: { test: 'data1' },
      });

      const auditEvent2 = await insertAuditEvent({
        action: 'update',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        action_detail: 'Updated user data',
        old_row: { test: 'old data' },
        context: { test: 'data2' },
      });

      const result = await selectAuditEvents({
        subject_user_id: user.user_id,
        table_names: ['users'],
        course_instance_id: '1',
      });

      assert.equal(result.length, 2);
      // Results should be ordered by date DESC
      assert.equal(result[0].id, auditEvent2.id);
      assert.equal(result[1].id, auditEvent1.id);
    });

    it('returns audit events for multiple table names', async () => {
      const user = await getOrCreateUser({
        uid: 'student@example.com',
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });

      // Insert test audit events for different tables
      const usersAuditEvent = await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        new_row: { test: 'new user data' },
        context: { test: 'users' },
      });

      const enrollmentsAuditEvent = await insertAuditEvent({
        action: 'insert',
        table_name: 'enrollments',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        new_row: { test: 'new enrollment data' },
        context: { test: 'enrollments' },
      });

      // Insert an audit event for a table not in the list
      await insertAuditEvent({
        action: 'insert',
        table_name: 'assessments',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        assessment_id: '1',
        new_row: { test: 'new assessment data' },
        context: { test: 'assessments' },
      });

      const result = await selectAuditEvents({
        subject_user_id: user.user_id,
        table_names: ['users', 'enrollments'],
        course_instance_id: '1',
      });

      assert.equal(result.length, 2);
      // Results should be ordered by date DESC
      assert.equal(result[0].id, enrollmentsAuditEvent.id);
      assert.equal(result[1].id, usersAuditEvent.id);
    });

    it('filters by course_instance_id correctly', async () => {
      const user = await getOrCreateUser({
        uid: 'student@example.com',
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });

      // Insert audit events for different course instances
      await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        new_row: { test: 'course1 user data' },
        context: { test: 'course1' },
      });

      await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '2',
        new_row: { test: 'course2 user data' },
        context: { test: 'course2' },
      });

      const result = await selectAuditEvents({
        subject_user_id: user.user_id,
        table_names: ['users'],
        course_instance_id: '1',
      });

      assert.equal(result.length, 1);
      assert.equal(result[0].course_instance_id, '1');
    });

    it('filters by subject_user_id correctly', async () => {
      const user1 = await getOrCreateUser({
        uid: 'student1@example.com',
        name: 'Example Student 1',
        uin: 'student1',
        email: 'student1@example.com',
      });

      const user2 = await getOrCreateUser({
        uid: 'student2@example.com',
        name: 'Example Student 2',
        uin: 'student2',
        email: 'student2@example.com',
      });

      // Insert audit events for different users
      await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user1.user_id,
        course_instance_id: '1',
        context: { test: 'user1' },
      });

      await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user2.user_id,
        course_instance_id: '1',
        context: { test: 'user2' },
      });

      const result = await selectAuditEvents({
        subject_user_id: user1.user_id,
        table_names: ['users'],
        course_instance_id: '1',
      });

      assert.equal(result.length, 1);
      assert.equal(result[0].subject_user_id, user1.user_id);
    });

    it('orders results by date DESC', async () => {
      const user = await getOrCreateUser({
        uid: 'student@example.com',
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });

      const olderEvent = await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        new_row: { test: 'older user data' },
        context: { test: 'older' },
      });

      const newerEvent = await insertAuditEvent({
        action: 'update',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        action_detail: 'Updated user data',
        old_row: { test: 'old data' },
        context: { test: 'newer' },
      });

      const result = await selectAuditEvents({
        subject_user_id: user.user_id,
        table_names: ['users'],
        course_instance_id: '1',
      });

      assert.equal(result.length, 2);
      // Newer event should come first
      assert.equal(result[0].id, newerEvent.id);
      assert.equal(result[1].id, olderEvent.id);
    });

    it('handles selectAuditEvents with agent_authn_user_id correctly', async () => {
      // Insert audit event with undefined subject_user_id
      const user = await getOrCreateUser({
        uid: 'student@example.com',
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });

      await insertAuditEvent({
        action: 'insert',
        table_name: 'users',
        row_id: '1',
        agent_authn_user_id: '1',
        agent_user_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        new_row: { test: 'new user data' },
        context: { test: 'null_user' },
      });

      const result = await selectAuditEvents({
        agent_authn_user_id: '1',
        table_names: ['users'],
        course_instance_id: '1',
      });

      assert.equal(result.length, 1);
    });

    it('includes all audit event fields in result', async () => {
      const user = await getOrCreateUser({
        uid: 'student@example.com',
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });

      const auditEvent = await insertAuditEvent({
        action: 'update',
        table_name: 'users',
        row_id: '1',
        subject_user_id: user.user_id,
        course_instance_id: '1',
        action_detail: 'Updated user profile',
        context: { test: 'full_fields' },
        old_row: { name: 'Old Name' },
        new_row: { name: 'New Name' },
        agent_authn_user_id: '1',
        agent_user_id: '1',
        institution_id: '1',
        course_id: '1',
        assessment_id: '1',
        assessment_instance_id: '1',
        assessment_question_id: '1',
        group_id: '1',
      });

      const result = await selectAuditEvents({
        subject_user_id: user.user_id,
        table_names: ['users'],
        course_instance_id: '1',
      });

      assert.equal(result.length, 1);
      const event = result[0];
      assert.equal(event.id, auditEvent.id);
      assert.equal(event.action, 'update');
      assert.equal(event.action_detail, 'Updated user profile');
      assert.equal(event.table_name, 'users');
      assert.equal(event.subject_user_id, user.user_id);
      assert.equal(event.course_instance_id, '1');
      assert.equal(event.row_id, '1');
      assert.deepEqual(event.context, { test: 'full_fields' });
      assert.deepEqual(event.old_row, { name: 'Old Name' });
      assert.deepEqual(event.new_row, { name: 'New Name' });
      assert.equal(event.agent_authn_user_id, '1');
      assert.equal(event.agent_user_id, '1');
      assert.equal(event.institution_id, '1');
      assert.equal(event.course_id, '1');
      assert.equal(event.assessment_id, '1');
      assert.equal(event.assessment_instance_id, '1');
      assert.equal(event.assessment_question_id, '1');
      assert.instanceOf(event.date, Date);
    });
  });
});
