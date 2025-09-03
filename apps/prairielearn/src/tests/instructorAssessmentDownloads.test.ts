/* eslint-disable @typescript-eslint/dot-notation */
import * as cheerio from 'cheerio';
import { parse as csvParse } from 'csv-parse/sync';
import type { Element } from 'domhandler';
import fetch from 'node-fetch';
import * as unzipper from 'unzipper';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { selectAssessmentSetById } from '../models/assessment-set.js';
import { selectAssessmentById } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
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
};

const assessmentPoints = 5;

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
          instance_question_points: assessmentPoints,
          instance_question_score_perc: (assessmentPoints / 5) * 100,
          assessment_instance_points: assessmentPoints,
          assessment_instance_score_perc:
            (assessmentPoints / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
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

      // TODO: A future PR should also test the group work downloads
      // This suite currently uses helperExam, which uses 'exam1-automaticTestSuite', which does
      // not have group work enabled.

      assert.isFalse(assessment.group_work);

      const filenames: string[] = Object.values(
        getFilenames({
          assessment,
          assessment_set: await selectAssessmentSetById(assessment.assessment_set_id),
          course_instance: await selectCourseInstanceById(locals.variant.course_instance_id),
          course: await selectCourseById(locals.variant.course_id),
        }),
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
