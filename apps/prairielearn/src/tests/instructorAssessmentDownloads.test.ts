/* eslint-disable @typescript-eslint/dot-notation */
import * as cheerio from 'cheerio';
import { parse as csvParse } from 'csv-parse/sync';
import type { Element } from 'domhandler';
import fetch from 'node-fetch';
import * as unzipper from 'unzipper';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import type { ResLocalsForPage } from '../lib/res-locals.js';
import { selectAssessmentSetById } from '../models/assessment-set.js';
import { selectAssessmentById, selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { getFilenames } from '../pages/instructorAssessmentDownloads/instructorAssessmentDownloads.js';

import * as helperExam from './helperExam.js';
import type { TestExamQuestion } from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

const locals = {} as {
  $: cheerio.CheerioAPI;
  shouldHaveButtons: string[];
  postAction: string;
  question: TestExamQuestion;
  expectedResult: {
    submission_score: number;
    submission_correct: boolean;
    instance_question_points: number;
    instance_question_score_perc: number;
    assessment_instance_points: number;
    assessment_instance_score_perc: number;
  };
  instructorAssessmentDownloadsUrl: string;
  courseInstanceBaseUrl: string;
  assessment_id: string;
  siteUrl: string;
  assessment_instance: {
    score_perc: number;
    points: number;
  };
  getSubmittedAnswer: (variant: any) => object;
  variant: {
    course_instance_id: string;
    course_id: string;
  };
};

const addNumbersMaxPoints = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.maxPoints;

describe('Instructor Assessment Downloads', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  let elemList: cheerio.Cheerio<Element>;
  let page: string;

  helperExam.startExam(locals, 'exam1-automaticTestSuite');

  describe('1. grade correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: addNumbersMaxPoints,
          instance_question_score_perc: 100,
          assessment_instance_points: addNumbersMaxPoints,
          assessment_instance_score_perc:
            (addNumbersMaxPoints / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant: any) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('2. GET to instructorAssessmentDownloads URL', function () {
    it('should succeed', async () => {
      locals.instructorAssessmentDownloadsUrl =
        locals.courseInstanceBaseUrl +
        '/instructor/assessment/' +
        locals.assessment_id +
        '/downloads';
      const res = await fetch(locals.instructorAssessmentDownloadsUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });

  describe('3. Check scores CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('scores.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.approximately(data[0]['Exam 1'], locals.assessment_instance.score_perc, 1e-6);
    });
  });

  describe('4. Check scoresByUsername CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('scores_by_username.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['Username'], 'dev');
      assert.approximately(data[0]['Exam 1'], locals.assessment_instance.score_perc, 1e-6);
    });
  });

  describe('5. Check points CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('points.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.approximately(data[0]['Exam 1'], locals.assessment_instance.points, 1e-6);
    });
  });

  describe('6. Check pointsByUsername CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('points_by_username.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['Username'], 'dev');
      assert.approximately(data[0]['Exam 1'], locals.assessment_instance.points, 1e-6);
    });
  });

  describe('7. Check instances CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('instances.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.equal(data[0]['Username'], 'dev');
      assert.equal(data[0]['Assessment'], 'Exam 1');
      assert.approximately(data[0]['Score (%)'], locals.assessment_instance.score_perc, 1e-6);
      assert.approximately(data[0]['Points'], locals.assessment_instance.points, 1e-6);
      assert.approximately(
        data[0]['Max points'],
        helperExam.exam1AutomaticTestSuite.maxPoints,
        1e-6,
      );
    });
  });

  describe('8. Check instanceQuestions CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('instance_questions.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert(data.every((entry) => entry['UID'] === 'dev@example.com'));
      assert(data.every((entry) => entry['Assessment'] === 'Exam 1'));
      const questions = data.map((entry) => entry['Question']).sort();
      const expectedQuestions = helperExam.exam1AutomaticTestSuite.questions.map((q) => q.qid);
      assert.deepEqual(questions, expectedQuestions);
    });
  });

  describe('9. Check submissionsForManualGrading CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('submissions_for_manual_grading.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['uid'], 'dev@example.com');
      assert.equal(data[0]['qid'], 'addNumbers');
    });
  });

  describe('10. Check allSubmissions CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('all_submissions.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.equal(data[0]['Assessment'], 'Exam 1');
      assert.equal(data[0]['Question'], 'addNumbers');
      assert.equal(data[0]['Correct'], 'TRUE');
    });
  });

  describe('11. Check finalSubmissions CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('final_submissions.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.equal(data[0]['Assessment'], 'Exam 1');
      assert.equal(data[0]['Question'], 'addNumbers');
      assert.equal(data[0]['Correct'], 'TRUE');
      assert.equal(data[0]['Max points'], 5);
      assert.equal(data[0]['Question % score'], 100);
    });
  });

  describe('12. Check bestSubmissions CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('best_submissions.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.equal(data[0]['Assessment'], 'Exam 1');
      assert.equal(data[0]['Question'], 'addNumbers');
      assert.equal(data[0]['Correct'], 'TRUE');
      assert.equal(data[0]['Max points'], 5);
      assert.equal(data[0]['Question % score'], 100);
    });
  });

  describe('13. Comprehensive test of all downloads', function () {
    it('should attempt to download every file in getFilenames', async () => {
      const assessment = await selectAssessmentById(locals.assessment_id);
      assert.isNotNull(assessment.assessment_set_id);
      assert.isFalse(assessment.team_work);

      const filenames: string[] = Object.values(
        getFilenames({
          assessment,
          assessment_set: await selectAssessmentSetById(assessment.assessment_set_id),
          course_instance: await selectCourseInstanceById(locals.variant.course_instance_id),
          course: await selectCourseById(locals.variant.course_id),
        } as ResLocalsForPage<'assessment'>),
      );

      await Promise.all(
        filenames.map(async (filename) => {
          const downloadUrl =
            locals.courseInstanceBaseUrl +
            '/instructor/assessment/' +
            locals.assessment_id +
            '/downloads/' +
            filename;
          const res = await fetch(downloadUrl);
          assert.equal(res.status, 200, `Failed to download ${filename}`);
          if (filename.endsWith('.csv')) {
            const csvContent = await res.text();
            const data = csvParse<any>(csvContent, { columns: true, cast: true });
            assert.isAtLeast(data.length, 1);
          } else if (filename.endsWith('.zip')) {
            const zipContent = Buffer.from(await res.arrayBuffer());
            const zip = await unzipper.Open.buffer(zipContent);
            assert.isAtLeast(zip.files.length, 1);
          } else {
            assert.fail(`Unknown file type: ${filename}`);
          }
        }),
      );
    });
  });
});

describe('Instructor Assessment Downloads - Group Work', { timeout: 60_000 }, function () {
  const storedConfig: Record<string, any> = {};

  beforeAll(helperServer.before());

  beforeAll(function () {
    // Save the original config so we can restore it later
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
  });

  afterAll(helperServer.after);

  afterAll(function () {
    // Restore the original config
    Object.assign(config, storedConfig);
  });

  const groupLocals: Record<string, any> = {};

  describe('1. Initialize group work assessment', function () {
    it('should get the group work assessment', async () => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam14-groupWork',
      });
      groupLocals.assessment_id = assessment.id;
      groupLocals.siteUrl = 'http://localhost:' + config.serverPort;
      groupLocals.courseInstanceBaseUrl = groupLocals.siteUrl + '/pl/course_instance/1';
      groupLocals.assessmentUrl =
        groupLocals.courseInstanceBaseUrl + '/assessment/' + assessment.id;
      groupLocals.instructorAssessmentGroupsUrl =
        groupLocals.courseInstanceBaseUrl + '/instructor/assessment/' + assessment.id + '/groups';
      groupLocals.instructorAssessmentDownloadsUrl =
        groupLocals.courseInstanceBaseUrl +
        '/instructor/assessment/' +
        assessment.id +
        '/downloads';
    });
  });

  describe('2. Create users and team via instructor interface', function () {
    it('should create 2 users for the team', async () => {
      // exam14-groupWork requires minimum 2 users
      groupLocals.studentUsers = await generateAndEnrollUsers({
        count: 2,
        course_instance_id: '1',
      });
      assert.lengthOf(groupLocals.studentUsers, 2);
    });

    it('should load the groups page', async () => {
      const res = await fetch(groupLocals.instructorAssessmentGroupsUrl);
      assert.equal(res.status, 200);
      const page = await res.text();
      groupLocals.$ = cheerio.load(page);
    });

    it('should have a CSRF token', function () {
      const elemList = groupLocals.$('form input[name="__csrf_token"]');
      assert.isAtLeast(elemList.length, 1);
      groupLocals.__csrf_token = elemList[0].attribs.value;
    });

    it('should create a team with 2 users', async () => {
      const res = await fetch(groupLocals.instructorAssessmentGroupsUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_team',
          __csrf_token: groupLocals.__csrf_token,
          team_name: 'testteam',
          uids: groupLocals.studentUsers[0].uid + ',' + groupLocals.studentUsers[1].uid,
        }),
      });
      assert.equal(res.status, 200);
    });
  });

  describe('3. Start the assessment as first student', function () {
    it('should switch to first student user', function () {
      const student = groupLocals.studentUsers[0];
      config.authUid = student.uid;
      config.authName = student.name;
      config.authUin = student.uin;
    });

    it('should load assessment page', async () => {
      const res = await fetch(groupLocals.assessmentUrl);
      assert.equal(res.status, 200);
      const page = await res.text();
      groupLocals.$ = cheerio.load(page);
    });

    it('should have a CSRF token', function () {
      const elemList = groupLocals.$('form input[name="__csrf_token"]');
      assert.isAtLeast(elemList.length, 1);
      groupLocals.__csrf_token = elemList[0].attribs.value;
    });

    it('should start the assessment', async () => {
      const res = await fetch(groupLocals.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: groupLocals.__csrf_token,
        }),
      });
      assert.equal(res.status, 200);
      const page = await res.text();
      groupLocals.$ = cheerio.load(page);
      groupLocals.assessmentInstanceUrl = res.url;
    });
  });

  describe('4. Answer the first question (addVectors)', function () {
    it('should find the question link', function () {
      // Find any question link in the assessment instance
      const questionLinks = groupLocals.$('a[href*="/instance_question/"]');
      assert.isAtLeast(questionLinks.length, 1, 'Should have at least one question link');
      groupLocals.questionUrl = groupLocals.siteUrl + questionLinks[0].attribs.href;
    });

    it('should load the question page', async () => {
      const res = await fetch(groupLocals.questionUrl);
      assert.equal(res.status, 200);
      const page = await res.text();
      groupLocals.$ = cheerio.load(page);
    });

    it('should have variant_id and CSRF token', function () {
      const variantInput = groupLocals.$('.question-form input[name="__variant_id"]');
      assert.lengthOf(variantInput, 1);
      groupLocals.variant_id = variantInput[0].attribs.value;

      const csrfInput = groupLocals.$('.question-form input[name="__csrf_token"]');
      assert.lengthOf(csrfInput, 1);
      groupLocals.__csrf_token = csrfInput[0].attribs.value;
    });

    it('should get the variant from the database', async () => {
      const { queryRow } = await import('@prairielearn/postgres');
      const { VariantSchema } = await import('../lib/db-types.js');
      groupLocals.variant = await queryRow(
        'SELECT * FROM variants WHERE id = $1',
        [groupLocals.variant_id],
        VariantSchema,
      );
    });

    it('should submit the correct answer', async () => {
      const res = await fetch(groupLocals.questionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: groupLocals.__csrf_token,
          __variant_id: groupLocals.variant_id,
          wx: String(groupLocals.variant.true_answer.wx),
          wy: String(groupLocals.variant.true_answer.wy),
        }),
      });
      assert.equal(res.status, 200);
    });
  });

  describe('5. Comprehensive test of all downloads for group work assessment', function () {
    it('should switch back to instructor user', function () {
      // Restore instructor credentials to access download URLs
      config.authUid = storedConfig.authUid;
      config.authName = storedConfig.authName;
      config.authUin = storedConfig.authUin;
    });

    it('should attempt to download every file in getFilenames', async () => {
      const assessment = await selectAssessmentById(groupLocals.assessment_id);
      assert.isNotNull(assessment.assessment_set_id);
      assert.isTrue(assessment.team_work);

      const filenames: string[] = Object.values(
        getFilenames({
          assessment,
          assessment_set: await selectAssessmentSetById(assessment.assessment_set_id),
          course_instance: await selectCourseInstanceById(groupLocals.variant.course_instance_id),
          course: await selectCourseById(groupLocals.variant.course_id),
        } as ResLocalsForPage<'assessment'>),
      );

      // Group work assessments should have additional team-related files
      assert.isTrue(
        filenames.some((f) => f.includes('group')),
        'Group work assessment should have group-related download files',
      );

      await Promise.all(
        filenames.map(async (filename) => {
          const downloadUrl = groupLocals.instructorAssessmentDownloadsUrl + '/' + filename;
          const res = await fetch(downloadUrl);
          assert.equal(res.status, 200, `Failed to download ${filename}`);
          if (filename.endsWith('.csv')) {
            const csvContent = await res.text();
            const data = csvParse<any>(csvContent, { columns: true, cast: true });
            assert.isAtLeast(data.length, 1, `CSV file ${filename} should have at least 1 row`);
          } else if (filename.endsWith('.zip')) {
            const zipContent = Buffer.from(await res.arrayBuffer());
            const zip = await unzipper.Open.buffer(zipContent);
            assert.isAtLeast(
              zip.files.length,
              1,
              `ZIP file ${filename} should have at least 1 file`,
            );
          } else {
            assert.fail(`Unknown file type: ${filename}`);
          }
        }),
      );
    });
  });
});
