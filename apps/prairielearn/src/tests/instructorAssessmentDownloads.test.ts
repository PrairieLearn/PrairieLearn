/* eslint-disable @typescript-eslint/dot-notation */
import * as cheerio from 'cheerio';
import { parse as csvParse } from 'csv-parse/sync';
import type { Element } from 'domhandler';
import fetch from 'node-fetch';
import * as unzipper from 'unzipper';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { type Assessment, type User, type Variant, VariantSchema } from '../lib/db-types.js';
import type { ResLocalsForPage } from '../lib/res-locals.js';
import { selectAssessmentSetById } from '../models/assessment-set.js';
import { selectAssessmentById, selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import type { Filenames } from '../pages/instructorAssessmentDownloads/instructorAssessmentDownloads.html.js';
import { getFilenames } from '../pages/instructorAssessmentDownloads/instructorAssessmentDownloads.js';

import { getCSRFToken } from './helperClient.js';
import * as helperExam from './helperExam.js';
import type { TestExamQuestion } from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';
import { withUser } from './utils/auth.js';

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

async function fetchPage(url: string): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url);
  assert.equal(res.status, 200);
  return cheerio.load(await res.text());
}

async function downloadCsv(url: string): Promise<any[]> {
  const res = await fetch(url);
  assert.equal(res.status, 200);
  return csvParse<any>(await res.text(), { columns: true, cast: true });
}

async function assertDownloadSucceeds(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  assert.equal(res.status, 200, `Failed to download ${filename}`);
  if (filename.endsWith('.csv')) {
    const data = csvParse<any>(await res.text(), { columns: true, cast: true });
    assert.isAtLeast(data.length, 1, `CSV file ${filename} should have at least one row`);
  } else if (filename.endsWith('.zip')) {
    const zip = await unzipper.Open.buffer(Buffer.from(await res.arrayBuffer()));
    assert.isAtLeast(zip.files.length, 1, `ZIP file ${filename} should have at least one file`);
  } else {
    assert.fail(`Unknown file type: ${filename}`);
  }
}

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
          await assertDownloadSucceeds(downloadUrl, filename);
        }),
      );
    });
  });

  describe('Group Work Downloads', function () {
    const ctx = {} as {
      assessment_id: string;
      siteUrl: string;
      courseInstanceBaseUrl: string;
      assessmentUrl: string;
      instructorAssessmentGroupsUrl: string;
      instructorAssessmentDownloadsUrl: string;
      studentUsers: User[];
      $: cheerio.CheerioAPI;
      questionUrl: string;
      variant: Variant;
      assessment: Assessment;
      filenames: Filenames;
    };

    beforeAll(async function () {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam14-groupWork',
      });
      ctx.assessment_id = assessment.id;
      ctx.siteUrl = 'http://localhost:' + config.serverPort;
      ctx.courseInstanceBaseUrl = ctx.siteUrl + '/pl/course_instance/1';
      ctx.assessmentUrl = ctx.courseInstanceBaseUrl + '/assessment/' + assessment.id;
      ctx.instructorAssessmentGroupsUrl =
        ctx.courseInstanceBaseUrl + '/instructor/assessment/' + assessment.id + '/groups';
      ctx.instructorAssessmentDownloadsUrl =
        ctx.courseInstanceBaseUrl + '/instructor/assessment/' + assessment.id + '/downloads';

      ctx.studentUsers = await generateAndEnrollUsers({ count: 2, course_instance_id: '1' });
      ctx.$ = await fetchPage(ctx.instructorAssessmentGroupsUrl);
      const res = await fetch(ctx.instructorAssessmentGroupsUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'add_group',
          __csrf_token: getCSRFToken(ctx.$),
          group_name: 'testteam',
          uids: ctx.studentUsers.map((u) => u.uid).join(','),
        }),
      });
      assert.equal(res.status, 200);

      await withUser(ctx.studentUsers[0], async () => {
        let studentRes = await fetch(ctx.assessmentUrl);
        assert.equal(studentRes.status, 200);
        ctx.$ = cheerio.load(await studentRes.text());

        studentRes = await fetch(ctx.assessmentUrl, {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'new_instance',
            __csrf_token: getCSRFToken(ctx.$),
          }),
        });
        assert.equal(studentRes.status, 200);
        ctx.$ = cheerio.load(await studentRes.text());

        const questionLinks = ctx.$('a[href*="/instance_question/"]');
        assert.isAtLeast(questionLinks.length, 1, 'Should have at least one question link');
        const questionHref = questionLinks.first().attr('href');
        assert.isString(questionHref);
        ctx.questionUrl = ctx.siteUrl + questionHref;

        studentRes = await fetch(ctx.questionUrl);
        assert.equal(studentRes.status, 200);
        ctx.$ = cheerio.load(await studentRes.text());

        // For v3/Freeform questions, get the variant ID from the hidden input
        const variantId = ctx.$('input[name="__variant_id"]').val();
        assert.isString(variantId);

        ctx.variant = await queryRow(
          'SELECT * FROM variants WHERE id = $1',
          [variantId],
          VariantSchema,
        );

        // Submit the correct answer for the addNumbers question
        studentRes = await fetch(ctx.questionUrl, {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'grade',
            __csrf_token: getCSRFToken(ctx.$),
            __variant_id: variantId as string,
            c: String(ctx.variant.true_answer!.c),
          }),
        });
        assert.equal(studentRes.status, 200);
      });

      ctx.assessment = await selectAssessmentById(ctx.assessment_id);
      ctx.filenames = getFilenames({
        assessment: ctx.assessment,
        assessment_set: await selectAssessmentSetById(ctx.assessment.assessment_set_id!),
        course_instance: await selectCourseInstanceById(ctx.variant.course_instance_id!),
        course: await selectCourseById(ctx.variant.course_id),
      } as ResLocalsForPage<'assessment'>);
    });

    it('should have team_work assessment with group-specific filenames', function () {
      assert.isTrue(ctx.assessment.team_work);
      assert.isDefined(ctx.filenames.groupsCsvFilename);
      assert.isDefined(ctx.filenames.scoresGroupCsvFilename);
      assert.isDefined(ctx.filenames.pointsGroupCsvFilename);
    });

    it('groups.csv should contain both team members', async () => {
      const data = await downloadCsv(
        ctx.instructorAssessmentDownloadsUrl + '/' + ctx.filenames.groupsCsvFilename,
      );
      const teamRows = data.filter((row) => row['group_name'] === 'testteam');
      assert.lengthOf(teamRows, 2);

      const uids = teamRows.map((row) => row['uid']);
      assert.include(uids, ctx.studentUsers[0].uid);
      assert.include(uids, ctx.studentUsers[1].uid);
    });

    it('scores_by_group.csv should contain team with valid score', async () => {
      const data = await downloadCsv(
        ctx.instructorAssessmentDownloadsUrl + '/' + ctx.filenames.scoresGroupCsvFilename,
      );
      const teamRow = data.find((row) => row['Group name'] === 'testteam');
      assert.isDefined(teamRow);
      assert.isString(teamRow['Usernames']);
      assert.property(teamRow, 'Exam 14');
      assert.isNumber(teamRow['Exam 14']);
      assert.isAtLeast(teamRow['Exam 14'], 0);
    });

    it('points_by_group.csv should contain team with valid points', async () => {
      const data = await downloadCsv(
        ctx.instructorAssessmentDownloadsUrl + '/' + ctx.filenames.pointsGroupCsvFilename,
      );
      const teamRow = data.find((row) => row['Group name'] === 'testteam');
      assert.isDefined(teamRow);
      assert.isString(teamRow['Usernames']);
      assert.property(teamRow, 'Exam 14');
      assert.isNumber(teamRow['Exam 14']);
      assert.isAtLeast(teamRow['Exam 14'], 0);
    });

    it('should download all files successfully', async () => {
      const filenames: string[] = Object.values(ctx.filenames);

      await Promise.all(
        filenames.map(async (filename) => {
          await assertDownloadSucceeds(
            ctx.instructorAssessmentDownloadsUrl + '/' + filename,
            filename,
          );
        }),
      );
    });
  });
});
