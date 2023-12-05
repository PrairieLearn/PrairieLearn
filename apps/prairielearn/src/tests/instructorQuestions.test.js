// @ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

const { config } = require('../lib/config');
var sqldb = require('@prairielearn/postgres');
var sql = sqldb.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');
const { idsEqual } = require('../lib/id');
const { testFileDownloads, testQuestionPreviews } = require('./helperQuestionPreview');

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceBaseUrl = baseUrl + '/course_instance/1/instructor';
const questionsUrl = courseInstanceBaseUrl + '/course_admin/questions';
const questionsUrlCourse = baseUrl + '/course/1/course_admin/questions';

const addNumbers = {
  id: '',
  qid: 'addNumbers',
  type: 'Freeform',
  title: 'Add two numbers',
};
const addVectors = {
  id: '',
  qid: 'addVectors',
  type: 'Calculation',
  title: 'Addition of vectors in Cartesian coordinates',
};
const downloadFile = {
  id: '',
  qid: 'downloadFile',
  type: 'Freeform',
  title: 'File download example question',
};
const differentiatePolynomial = {
  id: '',
  qid: 'differentiatePolynomial',
  type: 'Freeform',
  title: 'Differentiate a polynomial function of one variable',
};

describe('Instructor questions', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  var page, elemList, questionData;

  describe('the database', function () {
    let questions;
    it('should contain questions', function (callback) {
      sqldb.query(sql.select_questions, [], function (err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount === 0) {
          return callback(new Error('no questions in DB'));
        }
        questions = result.rows;
        callback(null);
      });
    });
    it('should contain the addNumbers question', function () {
      const question = _.find(questions, { directory: addNumbers.qid });
      assert.isDefined(question);
      addNumbers.id = question.id;
    });
    it('should contain the addVectors question', function () {
      const question = _.find(questions, { directory: addVectors.qid });
      assert.isDefined(question);
      addVectors.id = question.id;
    });
    it('should contain the downloadFile question', function () {
      const question = _.find(questions, {
        directory: downloadFile.qid,
      });
      assert.isDefined(question);
      downloadFile.id = question.id;
    });
    it('should contain the differentiatePolynomial question', function () {
      const question = _.find(questions, {
        directory: differentiatePolynomial.qid,
      });
      assert.isDefined(question);
      differentiatePolynomial.id = question.id;
    });
  });

  describe('GET ' + questionsUrlCourse, function () {
    let parsedPage;
    it('should load successfully', function (callback) {
      request(questionsUrlCourse, function (error, response, body) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      parsedPage = cheerio.load(page);
    });
    it('should contain question data', function () {
      questionData = parsedPage('#questionsTable').data('data');
      assert.isArray(questionData);
      questionData.forEach((question) => assert.isObject(question));
    });
    it('should include addNumbers question', function () {
      elemList = questionData.filter((question) => idsEqual(question.id, addNumbers.id));
      assert.lengthOf(elemList, 1);
      assert.equal(addNumbers.qid, elemList[0].qid);
      assert.equal(addNumbers.title, elemList[0].title);
    });
    it('should include addVectors question', function () {
      elemList = questionData.filter((question) => idsEqual(question.id, addVectors.id));
      assert.lengthOf(elemList, 1);
      assert.equal(addVectors.qid, elemList[0].qid);
      assert.equal(addVectors.title, elemList[0].title);
    });
    it('should include downloadFile question', function () {
      elemList = questionData.filter((question) => idsEqual(question.id, downloadFile.id));
      assert.lengthOf(elemList, 1);
      assert.equal(downloadFile.qid, elemList[0].qid);
      assert.equal(downloadFile.title, elemList[0].title);
    });
    it('should include differentiatePolynomial question', function () {
      elemList = questionData.filter((question) =>
        idsEqual(question.id, differentiatePolynomial.id),
      );
      assert.lengthOf(elemList, 1);
      assert.equal(differentiatePolynomial.qid, elemList[0].qid);
      assert.equal(differentiatePolynomial.title, elemList[0].title);
    });
  });

  describe('GET ' + questionsUrl, function () {
    let parsedPage;
    it('should load successfully', function (callback) {
      request(questionsUrl, function (error, response, body) {
        if (error) {
          return callback(error);
        }
        if (response.statusCode !== 200) {
          return callback(new Error('bad status: ' + response.statusCode));
        }
        page = body;
        callback(null);
      });
    });
    it('should parse', function () {
      parsedPage = cheerio.load(page);
    });
    it('should contain question data', function () {
      questionData = parsedPage('#questionsTable').data('data');
      assert.isArray(questionData);
      questionData.forEach((question) => assert.isObject(question));
    });
    it('should include addNumbers question', function () {
      elemList = questionData.filter((question) => idsEqual(question.id, addNumbers.id));
      assert.lengthOf(elemList, 1);
      assert.equal(addNumbers.qid, elemList[0].qid);
      assert.equal(addNumbers.title, elemList[0].title);
    });
    it('should include addVectors question', function () {
      elemList = questionData.filter((question) => idsEqual(question.id, addVectors.id));
      assert.lengthOf(elemList, 1);
      assert.equal(addVectors.qid, elemList[0].qid);
      assert.equal(addVectors.title, elemList[0].title);
    });
    it('should include downloadFile question', function () {
      elemList = questionData.filter((question) => idsEqual(question.id, downloadFile.id));
      assert.lengthOf(elemList, 1);
      assert.equal(downloadFile.qid, elemList[0].qid);
      assert.equal(downloadFile.title, elemList[0].title);
    });
    it('should include differentiatePolynomial question', function () {
      elemList = questionData.filter((question) =>
        idsEqual(question.id, differentiatePolynomial.id),
      );
      assert.lengthOf(elemList, 1);
      assert.equal(differentiatePolynomial.qid, elemList[0].qid);
      assert.equal(differentiatePolynomial.title, elemList[0].title);
    });
  });

  describe('Test Question Previews', function () {
    const previewPageInfo = {
      siteUrl: siteUrl,
      baseUrl: baseUrl,
      questionBaseUrl: courseInstanceBaseUrl + '/question',
      questionPreviewTabUrl: '/preview',
      isStudentPage: false,
    };

    testQuestionPreviews(previewPageInfo, addNumbers, addVectors);
    testFileDownloads(previewPageInfo, downloadFile);
  });
});
