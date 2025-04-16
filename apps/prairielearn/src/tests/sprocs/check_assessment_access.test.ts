import { assert } from 'chai';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { type EnumMode } from '../../lib/db-types.js';
import * as helperDb from '../helperDb.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function checkAssessmentAccess(params: {
  assessment_id: string;
  authz_mode: EnumMode;
  authz_mode_reason?: string;
  course_role: string;
  course_instance_role: string;
  user_id: string;
  uid: string;
  date: string;
  display_timezone: string;
}): Promise<boolean> {
  const result = await sqldb.callRow(
    'check_assessment_access',
    [
      params.assessment_id,
      params.authz_mode,
      params.authz_mode_reason,
      params.course_role,
      params.course_instance_role,
      params.user_id,
      params.uid,
      params.date,
      params.display_timezone,
    ],
    z.object({ authorized: z.boolean() }),
  );
  return result.authorized;
}

describe('sproc check_assessment_access* tests', function () {
  before('set up testing server', helperDb.before);
  after('tear down testing database', helperDb.after);

  before('setup sample environment', async () => {
    await sqldb.queryAsync(sql.setup_caa_scheduler_tests, {});
  });

  describe('without PrairieTest', () => {
    it('should allow access when mode, uid, start_date, and end_date matches', async () => {
      const authorized = await checkAssessmentAccess({
        assessment_id: '50',
        authz_mode: 'Public',
        course_role: 'None',
        course_instance_role: 'None',
        user_id: '1000',
        uid: 'valid@example.com',
        date: '2010-07-07 06:06:06-00',
        display_timezone: 'US/Central',
      });
      assert.isTrue(authorized);
    });

    it('show allow access in Exam mode without an exam_uuid', async () => {
      const authorized = await checkAssessmentAccess({
        assessment_id: '10',
        authz_mode: 'Exam',
        course_role: 'None',
        course_instance_role: 'None',
        user_id: '1000',
        uid: 'valid@example.com',
        date: '2010-07-07 06:06:06-00',
        display_timezone: 'US/Central',
      });
      assert.isTrue(authorized);
    });

    it('should not allow access when mode does not match', async () => {
      const authorized = await checkAssessmentAccess({
        assessment_id: '50',
        authz_mode: 'Exam',
        course_role: 'None',
        course_instance_role: 'None',
        user_id: '1000',
        uid: 'valid@example.com',
        date: '2010-07-07 06:06:06-00',
        display_timezone: 'US/Central',
      });
      assert.isFalse(authorized);
    });

    it('should not allow access when uid not in uids', async () => {
      const authorized = await checkAssessmentAccess({
        assessment_id: '50',
        authz_mode: 'Exam',
        course_role: 'None',
        course_instance_role: 'None',
        user_id: '1000',
        uid: 'invalid@example.com',
        date: '2010-07-07 06:06:06-00',
        display_timezone: 'US/Central',
      });
      assert.isFalse(authorized);
    });

    it('should not allow access when attempt date is before start_date', async () => {
      const authorized = await checkAssessmentAccess({
        assessment_id: '50',
        authz_mode: 'Exam',
        course_role: 'None',
        course_instance_role: 'None',
        user_id: '1000',
        uid: 'valid@example.com',
        date: '2008-07-07 06:06:06-00',
        display_timezone: 'US/Central',
      });
      assert.isFalse(authorized);
    });

    it('should not allow access when attempt date is after end_date', async () => {
      const authorized = await checkAssessmentAccess({
        assessment_id: '50',
        authz_mode: 'Exam',
        course_role: 'None',
        course_instance_role: 'None',
        user_id: '1000',
        uid: 'valid@example.com',
        date: '2012-07-07 06:06:06-00',
        display_timezone: 'US/Central',
      });
      assert.isFalse(authorized);
    });

    it('should not allow access when access rule mode is Public and exam_uuid is present', async () => {
      const authorized = await checkAssessmentAccess({
        assessment_id: '52',
        authz_mode: 'Public',
        course_role: 'None',
        course_instance_role: 'None',
        user_id: '1000',
        uid: 'valid@example.com',
        date: '2010-07-07 06:06:06-00',
        display_timezone: 'US/Central',
      });
      assert.isFalse(authorized);
    });
  });

  describe('with PrairieTest', () => {
    describe('without checked-in reservation', () => {
      it('should not allow access to an exam without exam_uuid', async () => {
        const authorized = await checkAssessmentAccess({
          assessment_id: '10',
          authz_mode: 'Exam',
          authz_mode_reason: 'PrairieTest',
          course_role: 'None',
          course_instance_role: 'None',
          user_id: '1000',
          uid: 'valid@example.com',
          date: '2010-07-07 06:06:06-00',
          display_timezone: 'US/Central',
        });
        assert.isFalse(authorized);
      });

      it('should not allow access to an exam with exam_uuid', async () => {
        const authorized = await checkAssessmentAccess({
          assessment_id: '11',
          authz_mode: 'Exam',
          authz_mode_reason: 'PrairieTest',
          course_role: 'None',
          course_instance_role: 'None',
          user_id: '1000',
          uid: 'valid@example.com',
          date: '2010-07-07 06:06:06-00',
          display_timezone: 'US/Central',
        });
        assert.isFalse(authorized);
      });
    });

    describe('with checked-in reservation', () => {
      before('create checked-in reservation for student', async () => {
        await sqldb.queryAsync(sql.insert_pt_reservation, { exam_id: 1 });
      });
      after('delete checked-in reservation for student', async () => {
        await sqldb.queryAsync(sql.delete_pt_reservation, { exam_id: 1 });
      });

      it('should not allow access to an exam without exam_uuid', async () => {
        const authorized = await checkAssessmentAccess({
          assessment_id: '10',
          authz_mode: 'Exam',
          authz_mode_reason: 'PrairieTest',
          course_role: 'None',
          course_instance_role: 'None',
          user_id: '1000',
          uid: 'valid@example.com',
          date: '2010-07-07 06:06:06-00',
          display_timezone: 'US/Central',
        });
        assert.isFalse(authorized);
      });

      it('should allow access to an exam with a matching exam_uuid', async () => {
        const authorized = await checkAssessmentAccess({
          assessment_id: '11',
          authz_mode: 'Exam',
          authz_mode_reason: 'PrairieTest',
          course_role: 'None',
          course_instance_role: 'None',
          user_id: '1000',
          uid: 'valid@example.com',
          date: '2010-07-07 06:06:06-00',
          display_timezone: 'US/Central',
        });
        assert.isTrue(authorized);
      });

      it('should not allow access to an exam with a not matching exam_uuid', async () => {
        const authorized = await checkAssessmentAccess({
          assessment_id: '12',
          authz_mode: 'Exam',
          authz_mode_reason: 'PrairieTest',
          course_role: 'None',
          course_instance_role: 'None',
          user_id: '1000',
          uid: 'valid@example.com',
          date: '2010-07-07 06:06:06-00',
          display_timezone: 'US/Central',
        });
        assert.isFalse(authorized);
      });

      it('should not allow access in Exam mode when access rule mode is null and exam_uuid is present', async () => {
        const authorized = await checkAssessmentAccess({
          assessment_id: '53',
          authz_mode: 'Exam',
          authz_mode_reason: 'PrairieTest',
          course_role: 'None',
          course_instance_role: 'None',
          user_id: '1000',
          uid: 'valid@example.com',
          date: '2010-07-07 06:06:06-00',
          display_timezone: 'US/Central',
        });
        assert.isFalse(authorized);
      });

      it('should not allow access in Exam mode when access rule has no explicit mode or exam_uuid', async () => {
        const authorized = await checkAssessmentAccess({
          assessment_id: '54',
          authz_mode: 'Exam',
          authz_mode_reason: 'PrairieTest',
          course_role: 'None',
          course_instance_role: 'None',
          user_id: '1000',
          uid: 'valid@example.com',
          date: '2010-07-07 06:06:06-00',
          display_timezone: 'US/Central',
        });
        assert.isFalse(authorized);
      });
    });
  });

  describe('with other authz_mode_reason values', () => {
    it('should not allow access if exam_uuid is set', async () => {
      const authorized = await checkAssessmentAccess({
        assessment_id: '11',
        authz_mode: 'Exam',
        authz_mode_reason: 'Network',
        course_role: 'None',
        course_instance_role: 'None',
        user_id: '1000',
        uid: 'valid@example.com',
        date: '2010-07-07 06:06:06-00',
        display_timezone: 'US/Central',
      });
      assert.isFalse(authorized);
    });
  });
});
