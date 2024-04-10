import ERR = require('async-stacktrace');
import _ = require('lodash');
import { assert } from 'chai';
import request = require('request');
import * as cheerio from 'cheerio';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';
import { TEST_COURSE_PATH } from '../lib/paths';
import * as helperServer from './helperServer';

const sql = sqldb.loadSqlEquiv(__filename);

const locals: Record<string, any> = {};
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1';

let page, form, elemList;

const question = [{ qid: 'addNumbers', type: 'Freeform', maxPoints: 5 }];
const questions = _.keyBy(question, 'qid');

describe('assessment instance group synchronization test', function () {
  this.timeout(10000);

  const storedConfig: Record<string, any> = {};
  before('store authenticated user', () => {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });
  after('unset authenticated user', () => {
    Object.assign(config, storedConfig);
  });

  before('set up testing server', helperServer.before(TEST_COURSE_PATH));
  after('shut down testing server', helperServer.after);
  describe('1. database initialization', function () {
    it('get group-based homework assessment id', function (callback) {
      sqldb.query(sql.select_group_work_assessment, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.notEqual(result.rowCount, 0);
        assert.notEqual(result.rows[0].id, undefined);
        locals.assessment_id = result.rows[0].id;
        locals.assessmentUrl = locals.courseInstanceBaseUrl + '/assessment/' + locals.assessment_id;
        locals.instructorAssessmentsUrlGroupTab =
          locals.courseInstanceBaseUrl + '/instructor/assessment/' + result.rows[0].id + '/groups';
        locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/instance_question';
        locals.assessmentsUrl = locals.courseInstanceBaseUrl + '/assessments';
        callback(null);
      });
    });
  });
  describe('2. GET to instructor assessments URL group tab for the first assessment', function () {
    it('should load successfully', function (callback) {
      request(locals.instructorAssessmentsUrlGroupTab, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 4);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });
  describe('3. user and group initialization', function () {
    it('create 3 users', function (callback) {
      sqldb.query(sql.generate_and_enroll_3_users, [], function (err, result) {
        if (ERR(err, callback)) return;

        assert.lengthOf(result.rows, 3);
        locals.studentUsers = result.rows.slice(0, 3);
        locals.groupCreator = locals.studentUsers[0];
        assert.lengthOf(locals.studentUsers, 3);
        callback(null);
      });
    });
    it('put 3 users in a group', function (callback) {
      const form = {
        __action: 'add_group',
        __csrf_token: locals.__csrf_token,
        group_name: 'testgroup',
        uids:
          locals.studentUsers[0].uid +
          ',' +
          locals.studentUsers[1].uid +
          ',' +
          locals.studentUsers[2].uid,
      };
      request.post(
        {
          url: locals.instructorAssessmentsUrlGroupTab,
          form,
          followAllRedirects: true,
        },
        function (err, response) {
          if (ERR(err, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          callback(null);
        },
      );
    });
    it('should create the correct group configuration', function (callback) {
      const params = {
        assessment_id: locals.assessment_id,
        group_name: 'testgroup',
      };
      sqldb.query(sql.select_group_users, params, function (err, result) {
        if (ERR(err, callback)) return;
        assert.equal(result.rowCount, 3);
        callback(null);
      });
    });
  });

  describe('4. assessment_instance initialization', function () {
    it('should be able to switch user we generated', function (callback) {
      const student = locals.studentUsers[1];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000001';
      callback(null);
    });
    it('should load assessment page successfully', function (callback) {
      request(locals.assessmentUrl, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });

    it('should be able to start the assessment', function (callback) {
      const form = {
        __action: 'new_instance',
        __csrf_token: locals.__csrf_token,
      };
      request.post(
        { url: locals.assessmentUrl, form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        },
      );
    });
    it('should have 1 assessment instance in db', function (callback) {
      sqldb.query(sql.select_all_assessment_instance, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 1);
        locals.assessment_instance_id = result.rows[0].id;
        locals.assessment_instance = result.rows[0];
        locals.assessmentInstanceUrl =
          locals.courseInstanceUrl + '/assessment_instance/' + locals.assessment_instance_id;
        assert.equal(result.rows[0].group_id, 1);
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
  });
  describe('5. question submission', function () {
    it('should be able to enter question page', function (callback) {
      const questionUrl = locals.$('a:contains("HW6.2")').attr('href');
      locals.questionUrl = `${locals.siteUrl}${questionUrl}`;
      request(locals.questionUrl, function (error, response, body) {
        if (ERR(error, callback)) return;
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a variant_id input', function () {
      elemList = locals.$('.question-form input[name="__variant_id"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.variant_id = elemList[0].attribs.value;
      locals.variant_id = Number.parseInt(locals.variant_id);
    });
    it('should have the variant in the DB if has grade or save button', function (callback) {
      const params = {
        variant_id: locals.variant_id,
      };
      sqldb.query(sql.select_variant, params, function (err, result) {
        if (ERR(err, callback)) return;
        locals.variant = result.rows[0];
        callback(null);
      });
    });
    it('should have a CSRF token if has grade or save button', function () {
      elemList = locals.$('.question-form input[name="__csrf_token"]');
      assert.lengthOf(elemList, 1);
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    describe('setting up the submission data', function () {
      locals.postAction = 'grade';
      locals.question = questions.addNumbers;
      locals.expectedResult = {
        submission_score: 1,
        submission_correct: true,
        instance_question_points: 1,
        instance_question_score_perc: (1 / 5) * 100,
        assessment_instance_points: 1,
        assessment_instance_score_perc: (1 / 10) * 100,
      };
      locals.getSubmittedAnswer = function (variant) {
        return {
          F: variant.true_answer.F,
        };
      };
    });
    it('should generate the submittedAnswer', function (callback) {
      locals.submittedAnswer = locals.getSubmittedAnswer(locals.variant);
      form = {
        __action: locals.postAction,
        __csrf_token: locals.__csrf_token,
        __variant_id: locals.variant.id,
      };
      _.assign(form, locals.submittedAnswer);
      request.post(
        { url: locals.questionUrl, form, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode + '\n' + body));
          }
          page = body;
          callback(null);
        },
      );
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });
  describe('6. check Score for current student', function () {
    it('should have the submission', function (callback) {
      const params = {
        variant_id: locals.variant.id,
      };
      sqldb.query(sql.select_last_submission_for_variants, params, function (err, result) {
        if (ERR(err, callback)) return;
        locals.submission = result.rows[0];
        callback(null);
      });
    });
    it('should be graded with expected score', function () {
      assert.equal(locals.submission.score, locals.expectedResult.submission_score);
    });
    it('should be graded with expected correctness', function () {
      assert.equal(locals.submission.correct, locals.expectedResult.submission_correct);
    });
    it('should still have the assessment_instance', function (callback) {
      const params = {
        assessment_instance_id: locals.assessment_instance_id,
      };
      sqldb.queryOneRow(sql.select_assessment_instance, params, function (err, result) {
        if (ERR(err, callback)) return;
        locals.assessment_instance = result.rows[0];
        callback(null);
      });
    });
  });
  describe('7. check Score for another student', function () {
    it('should be able to switch user we generated', function (callback) {
      const student = locals.studentUsers[2];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = '00000002';
      callback(null);
    });
    it('should load assessment page successfully', function (callback) {
      request(
        { url: locals.assessmentUrl, followAllRedirects: true },
        function (error, response, body) {
          if (ERR(error, callback)) return;
          if (response.statusCode !== 200) {
            return callback(new Error('bad status: ' + response.statusCode));
          }
          page = body;
          callback(null);
        },
      );
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
    it('should have a CSRF token', function () {
      elemList = locals.$('form input[name="__csrf_token"]');
      assert.nestedProperty(elemList[0], 'attribs.value');
      locals.__csrf_token = elemList[0].attribs.value;
      assert.isString(locals.__csrf_token);
    });
    it('should still have the only assessment instance in db', function (callback) {
      sqldb.query(sql.select_all_assessment_instance, [], function (err, result) {
        if (ERR(err, callback)) return;
        assert.lengthOf(result.rows, 1);
        assert.equal(result.rows[0].id, locals.assessment_instance_id);
        locals.assessment_instance = result.rows[0];
        callback(null);
      });
    });
  });
});
