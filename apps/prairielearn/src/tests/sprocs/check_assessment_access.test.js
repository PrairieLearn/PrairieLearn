// @ts-check
const { assert } = require('chai');
const sqldb = require('@prairielearn/postgres');

const helperDb = require('../helperDb');

const sql = sqldb.loadSqlEquiv(__filename);

/**
 * @param {string | number} assessment_id
 * @param {string | number} exam_id
 * @param { string | number} second_assessment_id
 * @param {boolean} [expectWideOpen]
 * @param {boolean} [seeOtherExams]
 */
function reservationTests(
  assessment_id,
  exam_id,
  second_assessment_id,
  expectWideOpen = false,
  seeOtherExams = false,
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

  describe(`with checked-in reservation for student for exam ${exam_id}`, () => {
    before(`create checked-in reservation for student for exam ${exam_id}`, async () => {
      await sqldb.queryAsync(sql.insert_ps_reservation, { exam_id });
    });

    it('pass for student inside start_date/end_date, checked-in reservation, inside access_start/end', async () => {
      const result = await sqldb.callAsync(`check_assessment_access`, [
        'Exam',
        'None',
        'None',
        1000,
        'student@school.edu',
        '2010-07-07 06:06:06-00',
        'US/Central',
      ]);

      assert.strictEqual(result.rows[0].authorized, true);
    });

    it(`${expectedWord} for student inside start_date/end_date, checked-in reservation, after access_start/end`, async () => {
      const result = await sqldb.callAsync(`check_assessment_access`, [
        assessment_id,
        'Exam',
        'None',
        'None',
        1000,
        'student@school.edu',
        '2010-08-07 06:06:06-00',
        'US/Central',
      ]);

      assert.strictEqual(result.rows[0].authorized, expectedBool);
    });

    let otherExams = {
      word: 'fail',
      bool: false,
    };
    if (seeOtherExams) {
      otherExams.word = 'pass';
      otherExams.bool = true;
    }

    it(`${otherExams.word} for access to PL course other assessment (${second_assessment_id}) when checked-in to exam ${exam_id}`, async () => {
      const result = await sqldb.callAsync(`check_assessment_access`, [
        'Exam',
        'None',
        'None',
        1000,
        'student@school.edu',
        '2010-07-07 06:06:06-00',
        'US/Central',
      ]);

      assert.strictEqual(result.rows[0].authorized, otherExams.bool);
    });
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
        reservationTests(10, 1, 13, true, true);
      });
      describe('Linked exam', () => {
        reservationTests(11, 1, 13, false, true);
      });
      describe('Linked exam in different PS course', () => {
        reservationTests(12, 5, 13, false, true);
      });
    });

    describe('PL course linked to 1 PS course', () => {
      describe('Unlinked exam', () => {
        reservationTests(20, 2, 23, false, true);
      });
      describe('Linked exam', () => {
        reservationTests(21, 2, 23, false, true);
      });
      describe('Linked exam in different PS course', () => {
        reservationTests(22, 5, 23, false, false);
      });
    });

    describe('PL course linked to >1 PS course', () => {
      describe('Unlinked exam', () => {
        reservationTests(40, 4, 43, false, true);
      });
      describe('Linked exam', () => {
        reservationTests(41, 4, 43, false, true);
      });
      describe('Linked exam in different PS course', () => {
        reservationTests(42, 5, 43, false, false);
      });
    });
  });
});
