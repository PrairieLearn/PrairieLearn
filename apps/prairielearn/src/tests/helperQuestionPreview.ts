import { assert } from 'chai';
import request = require('request');
import * as helperQuestion from './helperQuestion';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

interface QuestionPreviewPageInfo {
  siteUrl: string;
  baseUrl: string;
  questionBaseUrl: string;
  questionPreviewTabUrl: string;
  isStudentPage: boolean;
}

interface QuestionInfo {
  id: string;
  qid: string;
  type: string;
  title: string;
}

export function testQuestionPreviews(
  previewPageInfo: QuestionPreviewPageInfo,
  addNumbers: QuestionInfo,
  addVectors: QuestionInfo,
) {
  const locals: any = previewPageInfo;
  describe('1. submit correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.question = addVectors;
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.postAction = 'grade';
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
        const elemList = locals.$('div.submission-body :contains("Invalid")');
        assert.isAtLeast(elemList.length, 1);
      });
    });
  });
}

export function testFileDownloads(
  previewPageInfo: QuestionPreviewPageInfo,
  downloadFile: QuestionInfo,
  shouldAccessClientFilesCourse: boolean,
) {
  const locals: any = previewPageInfo;

  describe('Test downloading files', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save', 'newVariant'];
        locals.question = downloadFile;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('downloading course text file', function () {
      let elemList;
      it('should contain a link to clientFilesCourse/data.txt', function () {
        elemList = locals.$('a[href*="clientFilesCourse"]');
        assert.lengthOf(elemList, 1);
      });
      let page;
      it('should download something with the link to clientFilesCourse/data.txt', function (callback) {
        const fileUrl = locals.siteUrl + elemList[0].attribs.href;
        request(fileUrl, function (error, response, body) {
          if (shouldAccessClientFilesCourse) {
            if (error) {
              return callback(error);
            }
            if (response.statusCode !== 200) {
              return callback(new Error('bad status: ' + response.statusCode));
            }
            page = body;
          } else {
            if (response.statusCode !== 404) {
              return callback(new Error('Should not have been able to access clientFilesCourse'));
            }
          }
          callback(null);
        });
      });
      it('should have downloaded a file with the contents of clientFilesCourse/data.txt', function () {
        if (shouldAccessClientFilesCourse) {
          assert.equal(page, 'This data is specific to the course.');
        }
      });
    });
    describe('downloading question text files', function () {
      let elemList, page;
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
      let elemList, page;
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
      let elemList, page;
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
      it('should produce no issues', async function () {
        const result = await sqldb.queryAsync(sql.select_issues_for_last_variant, []);
        if (result.rowCount != null && result.rowCount > 0) {
          throw new Error(`found ${result.rowCount} issues (expected zero issues)`);
        }
      });
    });
  });
}
