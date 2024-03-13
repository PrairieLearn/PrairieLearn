import { assert } from 'chai';
import * as sqldb from '@prairielearn/postgres';

import * as helperDb from '../helperDb';

const sql = sqldb.loadSqlEquiv(__filename);

function reservationTests(
  assessment_id: string | number,
  exam_id: string | number,
  second_assessment_id: string | number,
  expectWideOpen = false,
) {
  let expectedWord = 'fail';
  let expectedBool = false;

  // Handle the special case without any linking
  if (expectWideOpen) {
    expectedWord = 'pass';
    expectedBool = true;
  }

  it(`${expectedWord} for student inside start_date/end_date, no reservation, assessment ${assessment_id}`, async () => {
    const result = await sqldb.callAsync(`check_assessment_access`, [
      assessment_id,
      'Exam',
      'None',
      'None',
      1002,
      'instructor@school.edu',
      '2010-07-07 06:06:06-00',
      'US/Central',
    ]);

    assert.strictEqual(result.rows[0].authorized, expectedBool);
  });
}

describe('sproc check_assessment_access* tests', function () {
  describe('check_assessment_access scheduler tests', function () {
    before('set up testing server', helperDb.before);
    after('tear down testing database', helperDb.after);

    before('setup sample environment', async () => {
      await sqldb.queryAsync(sql.setup_caa_scheduler_tests, {});
    });

    describe('PL course not linked anywhere', () => {
      describe('Unlinked exam', () => {
        reservationTests(10, 1, 13, true);
      });
      describe('Linked exam', () => {
        reservationTests(11, 1, 13, false);
      });
      describe('Linked exam in different PS course', () => {
        reservationTests(12, 5, 13, false);
      });
    });
  });
});
