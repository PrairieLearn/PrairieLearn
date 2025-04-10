import { assert } from 'chai';
 import * as cheerio from 'cheerio';
 // import { promisify } from 'util';
 import fetch from 'node-fetch';

 import * as sqldb from '@prairielearn/postgres'

 import { config } from '../lib/config.js';


import * as helperQuestion from './helperQuestion.js';
 import * as helperServer from './helperServer.js';
// import { fetchCheerio } from './helperClient.js';

 // const requestAsync = await fetch()
 // const sql = sqlLoader.loadSqlEquiv(__filename);
 const sql = sqldb.loadSqlEquiv(import.meta.url)
 interface Question {
   qid: string;
   type: string;
   id?: number;
   url?: string;
   points?: number;
 }

 const locals: {
   [key: string]: any;
   siteUrl?: string;
   baseUrl?: string;
   courseBaseUrl?: string;
   courseInstanceBaseUrl?: string;
   instructorBaseUrl?: string;
   instructorAssessmentsUrl?: string;
   instructorGradebookUrl?: string;
   questionBaseUrl?: string;
   assessmentsUrl?: string;
   isStudentPage?: boolean;
   totalPoints?: number;
   questions?: Question[];
   assessment_id?: string;
   assessmentInstanceUrl?: string;
   assessmentUrl?: string;
   instance_questions?: Question[];
 } = {};

 locals.siteUrl = `http://localhost:${config.serverPort}`;
 locals.baseUrl = `${locals.siteUrl}/pl`;
 locals.courseBaseUrl = `${locals.baseUrl}/course/1`;
 locals.courseInstanceBaseUrl = `${locals.baseUrl}/course_instance/1`;
 locals.instructorBaseUrl = `${locals.courseInstanceBaseUrl}/instructor`;
 locals.instructorAssessmentsUrl = `${locals.instructorBaseUrl}/instance_admin/assessments`;
 locals.instructorGradebookUrl = `${locals.instructorBaseUrl}/instance_admin/gradebook`;
 locals.questionBaseUrl = `${locals.courseInstanceBaseUrl}/instance_question`;
 locals.assessmentsUrl = `${locals.courseInstanceBaseUrl}/assessments`;
 locals.isStudentPage = true;

 const questionsArray: Question[] = [

   { qid: 'addNumbersParameterized/2', type: 'Freeform' },

 ];

 describe('Parameterized questions', function () {
   this.timeout(40000);

   before('set up testing server', helperServer.before());
   after('shut down testing server', helperServer.after);

   it('should verify database contains expected questions', async function () {
     const result = await sqldb.queryAsync(sql.select_questions, []);
     assert.notEqual(result.rowCount, 0, 'No questions found in DB');
     locals.questions = result.rows.map(row => ({
       qid: row.directory,
       id: row.id,
       url: `${locals.questionBaseUrl}/${row.id}/`,
       type: 'Freeform'
     }));
     questionsArray.forEach(question => {
       const foundQuestion = locals.questions?.find(q => q.qid === question.qid);
       assert.isDefined(foundQuestion, `Question ${question.qid} not found`);
       Object.assign(question, foundQuestion);
     });
   });

   describe('Assessment inheritance tests', function () {
     before('initialize assessment', async function () {
       const hwResult = await sqldb.queryOneRowAsync(sql.select_hw, []);
       locals.assessment_id = hwResult.rows[0].id;
       locals.assessmentUrl = `${locals.courseInstanceBaseUrl}/assessment/${locals.assessment_id}/`;
       const response = await fetch(locals.assessmentUrl);
       assert.equal(response.status, 200);
       locals.$ = cheerio.load(await response.text());
       console.log(locals)
     });

     questionsArray.forEach((question, index) => {
       it(`should verify question #${index + 1} (${question.qid}) has correct parameters`, async function () {
         if (!question.url) throw new Error(`URL for question #${index + 1} (${question.qid}) is undefined`);
         console.log(helperQuestion.getInstanceQuestion(locals))
         const response = await fetch(question.url);
         assert.equal(response.status, 200);
         const $ = cheerio.load(await response.text());
         const expectedRange = '[3, 16]';
         const elemList = $('span').filter(function () {
           return $(this).text().trim() === expectedRange;
         });
         assert.lengthOf(elemList, 1, `Expected range ${expectedRange} not found for question ${question.qid}`);
       });
     });
   });
 });
