// @ts-check
const editor = require('../lib/editorUtil');
const assert = require('chai').assert;

describe('editor library', () => {
  it('gets details for course info file', () => {
    const details = editor.getDetailsForFile('infoCourse.json');
    assert.equal(details.type, 'course');
  });

  it('gets details for course instance info file', () => {
    const details = /** @type {import('../lib/editorUtil').CourseInstanceInfo} */ (
      editor.getDetailsForFile('courseInstances/testinstance/infoCourseInstance.json')
    );
    assert.equal(details.type, 'courseInstance');
    assert.equal(details.ciid, 'testinstance');
  });

  it('gets details for question info', () => {
    const details = /** @type {import('../lib/editorUtil').QuestionInfo} */ (
      editor.getDetailsForFile('questions/testquestion/info.json')
    );
    assert.equal(details.type, 'question');
    assert.equal(details.qid, 'testquestion');
  });

  it('gets details for assessment info file', () => {
    const details = /** @type {import('../lib/editorUtil').AssessmentInfo} */ (
      editor.getDetailsForFile(
        'courseInstances/testinstance/assessments/testassessment/infoAssessment.json',
      )
    );
    assert.equal(details.type, 'assessment');
    assert.equal(details.ciid, 'testinstance');
    assert.equal(details.aid, 'testassessment');
  });
});
