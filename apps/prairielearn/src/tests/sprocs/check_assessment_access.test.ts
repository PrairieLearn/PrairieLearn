import ERR = require('async-stacktrace');
import { assert } from 'chai';

import * as sqldb from '@prairielearn/postgres';
import * as helperDb from '../helperDb';

const sql = sqldb.loadSqlEquiv(__filename);

describe('sproc check_assessment_access* tests', function () {
  before('set up testing server', helperDb.before);
  after('tear down testing database', helperDb.after);

  before('setup sample environment', function (callback) {
    sqldb.query(sql.setup_caa_scheduler_tests, {}, (err, _result) => {
      if (ERR(err, callback)) return;
      callback(null);
    });
  });

  describe('check_assessment_access allowAccess parameter tests', () => {
    it('should allow access when rule role is Student', (callback) => {
      const params = [
        50,
        'Public',
        'None',
        'None',
        1000,
        'valid@school.edu',
        '2010-07-07 06:06:06-00',
        'US/Central',
      ];
      sqldb.call(`check_assessment_access`, params, (err, result) => {
        if (ERR(err, callback)) return;
        assert.strictEqual(result.rows[0].authorized, true);
        callback(null);
      });
    });

    it('should allow access when mode, uid, start_date, and end_date matches', (callback) => {
      const params = [
        50,
        'Public',
        'None',
        'None',
        1000,
        'valid@school.edu',
        '2010-07-07 06:06:06-00',
        'US/Central',
      ];
      sqldb.call(`check_assessment_access`, params, (err, result) => {
        if (ERR(err, callback)) return;
        assert.strictEqual(result.rows[0].authorized, true);
        callback(null);
      });
    });

    it('should not allow access when mode does not match', (callback) => {
      const params = [
        50,
        'Exam',
        'None',
        'None',
        1000,
        'valid@school.edu',
        '2010-07-07 06:06:06-00',
        'US/Central',
      ];
      sqldb.call(`check_assessment_access`, params, (err, result) => {
        if (ERR(err, callback)) return;
        assert.strictEqual(result.rows[0].authorized, false);
        callback(null);
      });
    });

    it('should not allow access when uid not in uids', (callback) => {
      const params = [
        50,
        'Exam',
        'None',
        'None',
        1000,
        'invalid@school.edu',
        '2010-07-07 06:06:06-00',
        'US/Central',
      ];
      sqldb.call(`check_assessment_access`, params, (err, result) => {
        if (ERR(err, callback)) return;
        assert.strictEqual(result.rows[0].authorized, false);
        callback(null);
      });
    });

    it('should not allow access when attempt date is before start_date', (callback) => {
      const params = [
        50,
        'Exam',
        'None',
        'None',
        1000,
        'valid@school.edu',
        '2008-07-07 06:06:06-00',
        'US/Central',
      ];
      sqldb.call(`check_assessment_access`, params, (err, result) => {
        if (ERR(err, callback)) return;
        assert.strictEqual(result.rows[0].authorized, false);
        callback(null);
      });
    });
    it('should not allow access when attempt date is after end_date', (callback) => {
      const params = [
        50,
        'Exam',
        'None',
        'None',
        1000,
        'valid@school.edu',
        '2012-07-07 06:06:06-00',
        'US/Central',
      ];
      sqldb.call(`check_assessment_access`, params, (err, result) => {
        if (ERR(err, callback)) return;
        assert.strictEqual(result.rows[0].authorized, false);
        callback(null);
      });
    });
    it('should not allow access when mode:Public and exam_uuid is present', (callback) => {
      const params = [
        52,
        'Public',
        'None',
        'None',
        1000,
        'valid@school.edu',
        '2010-07-07 06:06:06-00',
        'US/Central',
      ];
      sqldb.call(`check_assessment_access`, params, (err, result) => {
        if (ERR(err, callback)) return;
        assert.strictEqual(result.rows[0].authorized, false);
        callback(null);
      });
    });
  });

  /////////////////////////////////////////////////////////////////////////////

  describe('check_assessment_access PrairieTest scheduler tests', function () {
    describe('No checked in reservation', () => {
      it('should allow access to an exam without exam_uuid', (callback) => {
        const params = [
          10,
          'Exam',
          'None',
          'None',
          1000,
          'valid@school.edu',
          '2010-07-07 06:06:06-00',
          'US/Central',
        ];
        sqldb.call(`check_assessment_access`, params, (err, result) => {
          if (ERR(err, callback)) return;
          assert.strictEqual(result.rows[0].authorized, true);
          callback(null);
        });
      });
      it('should not allow access to an exam with exam_uuid', (callback) => {
        const params = [
          11,
          'Exam',
          'None',
          'None',
          1000,
          'valid@school.edu',
          '2010-07-07 06:06:06-00',
          'US/Central',
        ];
        sqldb.call(`check_assessment_access`, params, (err, result) => {
          if (ERR(err, callback)) return;
          assert.strictEqual(result.rows[0].authorized, false);
          callback(null);
        });
      });
    });
    describe('Checked in reservation', () => {
      before(`create checked-in reservation for student`, function (callback) {
        sqldb.query(sql.insert_pt_reservation, { exam_id: 1 }, (err, _result) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      });

      it('should not allow access to an exam without exam_uuid', (callback) => {
        const params = [
          10,
          'Exam',
          'None',
          'None',
          1000,
          'valid@school.edu',
          '2010-07-07 06:06:06-00',
          'US/Central',
        ];
        sqldb.call(`check_assessment_access`, params, (err, result) => {
          if (ERR(err, callback)) return;
          assert.strictEqual(result.rows[0].authorized, false);
          callback(null);
        });
      });

      it('should allow access to an exam with a matching exam_uuid', (callback) => {
        const params = [
          11,
          'Exam',
          'None',
          'None',
          1000,
          'valid@school.edu',
          '2010-07-07 06:06:06-00',
          'US/Central',
        ];
        sqldb.call(`check_assessment_access`, params, (err, result) => {
          if (ERR(err, callback)) return;
          assert.strictEqual(result.rows[0].authorized, true);
          callback(null);
        });
      });

      it('should not allow access to an exam with a not matching exam_uuid', (callback) => {
        const params = [
          12,
          'Exam',
          'None',
          'None',
          1000,
          'valid@school.edu',
          '2010-07-07 06:06:06-00',
          'US/Central',
        ];
        sqldb.call(`check_assessment_access`, params, (err, result) => {
          if (ERR(err, callback)) return;
          assert.strictEqual(result.rows[0].authorized, false);
          callback(null);
        });
      });
    });
  });
});
