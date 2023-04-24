var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var request = require('request');
var cheerio = require('cheerio');

const { config } = require('../lib/config');
var sqldb = require('@prairielearn/postgres');
var sql = sqldb.loadSqlEquiv(__filename);

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');
const { idsEqual } = require('../lib/id');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseBaseUrl = locals.baseUrl + '/course/1';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
locals.questionPreviewTabUrl = '/preview';
locals.questionsUrl = locals.courseInstanceBaseUrl + '/course_admin/questions';
locals.questionsUrlCourse = locals.courseBaseUrl + '/course_admin/questions';
locals.isStudentPage = false;

const addNumbers = {
  qid: 'addNumbers',
  type: 'Freeform',
  title: 'Add two numbers',
};
const addVectors = {
  qid: 'addVectors',
  type: 'Calculation',
  title: 'Addition of vectors in Cartesian coordinates',
};
const downloadFile = {
  qid: 'downloadFile',
  type: 'Freeform',
  title: 'File download example question',
};
const differentiatePolynomial = {
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
    it('should contain questions', function (callback) {
      sqldb.query(sql.select_questions, [], function (err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount === 0) {
          return callback(new Error('no questions in DB'));
        }
        locals.questions = result.rows;
        callback(null);
      });
    });
    it('should contain the addNumbers question', function () {
      const question = _.find(locals.questions, { directory: addNumbers.qid });
      assert.isDefined(question);
      addNumbers.id = question.id;
    });
    it('should contain the addVectors question', function () {
      const question = _.find(locals.questions, { directory: addVectors.qid });
      assert.isDefined(question);
      addVectors.id = question.id;
    });
    it('should contain the downloadFile question', function () {
      const question = _.find(locals.questions, {
        directory: downloadFile.qid,
      });
      assert.isDefined(question);
      downloadFile.id = question.id;
    });
    it('should contain the differentiatePolynomial question', function () {
      const question = _.find(locals.questions, {
        directory: differentiatePolynomial.qid,
      });
      assert.isDefined(question);
      differentiatePolynomial.id = question.id;
    });
  });

  describe('GET ' + locals.questionsUrlCourse, function () {
    it('should load successfully', function (callback) {
      request(locals.questionsUrlCourse, function (error, response, body) {
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
      locals.$ = cheerio.load(page);
    });
    it('should contain question data', function () {
      questionData = locals.$('#questionsTable').data('data');
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
        idsEqual(question.id, differentiatePolynomial.id)
      );
      assert.lengthOf(elemList, 1);
      assert.equal(differentiatePolynomial.qid, elemList[0].qid);
      assert.equal(differentiatePolynomial.title, elemList[0].title);
    });
  });

  describe('GET ' + locals.questionsUrl, function () {
    it('should load successfully', function (callback) {
      request(locals.questionsUrl, function (error, response, body) {
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
      locals.$ = cheerio.load(page);
    });
    it('should contain question data', function () {
      questionData = locals.$('#questionsTable').data('data');
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
        idsEqual(question.id, differentiatePolynomial.id)
      );
      assert.lengthOf(elemList, 1);
      assert.equal(differentiatePolynomial.qid, elemList[0].qid);
      assert.equal(differentiatePolynomial.title, elemList[0].title);
    });
  });

  describe('1. submit correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.postAction = 'grade';
        locals.question = addVectors;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            wx: variant.true_answer.wx,
            wy: variant.true_answer.wy,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkSubmissionScore(locals);
  });

  describe('2. save incorrect answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.postAction = 'save';
        locals.question = addVectors;
        locals.expectedResult = {
          submission_score: null,
          submission_correct: null,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            wx: 500,
            wy: -100,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkSubmissionScore(locals);
  });

  describe('3. submit incorrect answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.postAction = 'grade';
        locals.question = addVectors;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            wx: -300,
            wy: 400,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkSubmissionScore(locals);
  });

  describe('4. submit correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.postAction = 'grade';
        locals.question = addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkSubmissionScore(locals);
  });

  describe('5. submit incorrect answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.postAction = 'grade';
        locals.question = addNumbers;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c + 1,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkSubmissionScore(locals);
  });

  describe('6. submit invalid answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.postAction = 'grade';
        locals.question = addNumbers;
        locals.expectedResult = {
          submission_score: null,
          submission_correct: null,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            c: 'not_a_number',
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkSubmissionScore(locals);
    describe('the submission panel contents', function () {
      it('should contain "Invalid"', function () {
        elemList = locals.$('div.submission-body :contains("Invalid")');
        assert.isAtLeast(elemList.length, 1);
      });
    });
  });

  describe('8. test downloading files', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.question = downloadFile;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('downloading course text file', function () {
      it('should contain a link to clientFilesCourse/data.txt', function () {
        elemList = locals.$('a[href*="clientFilesCourse"]');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the link to clientFilesCourse/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
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
      it('should have downloaded a file with the contents of clientFilesCourse/data.txt', function () {
        assert.equal(page, 'This data is specific to the course.');
      });
    });
    describe('downloading question text files', function () {
      it('should contain a force-download link to clientFilesQuestion/data.txt', function () {
        elemList = locals.$('a[href*="clientFilesQuestion"][download]');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the force-download link to clientFilesQuestion/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
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
      it('should have downloaded a file with the contents of clientFilesQuestion/data.txt', function () {
        assert.equal(page, 'This data is specific to the question.');
      });
      it('should contain a new tab link to clientFilesQuestion/data.txt', function () {
        elemList = locals.$('a[href*="clientFilesQuestion"][target="_blank"]:not([download])');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the new tab link to clientFilesQuestion/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
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
      it('should have downloaded a file with the contents of clientFilesQuestion/data.txt', function () {
        assert.equal(page, 'This data is specific to the question.');
      });
    });
    describe('downloading dynamic text file', function () {
      it('should contain a link to generatedFilesQuestion/data.txt', function () {
        elemList = locals.$('a[href*="generatedFilesQuestion"][href$="data.txt"]');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the link to generatedFilesQuestion/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
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
      it('should have downloaded a file with the contents of generatedFilesQuestion/data.txt', function () {
        assert.equal(page, 'This data is generated by code.');
      });
    });
    describe('downloading dynamic image file', function () {
      it('should contain a link to generatedFilesQuestion/figure.png', function () {
        elemList = locals.$('a[href*="generatedFilesQuestion"][href$="figure.png"]');
        assert.lengthOf(elemList, 1);
      });
      it('should download something with the link to generatedFilesQuestion/figure.png', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request({ url: fileUrl, encoding: null }, function (error, response, body) {
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
      it('should have downloaded a file with the contents of generatedFilesQuestion/figure.png', function () {
        // assert.equal(page,'This data is generated by code.')
        assert.equal(page.slice(0, 8).toString('hex'), '89504e470d0a1a0a');
      });
      it('should produce no issues', function (callback) {
        sqldb.query(sql.select_issues_for_last_variant, [], (err, result) => {
          if (ERR(err, callback)) return;
          if (result.rowCount > 0) {
            callback(new Error(`found ${result.rowCount} issues (expected zero issues)`));
            return;
          }
          callback(null);
        });
      });
    });
  });
});
