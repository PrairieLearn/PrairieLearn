import * as editor from '../lib/editorUtil';
import { assert } from 'chai';

describe('editor library', () => {
  it('gets details for course info file', () => {
    const details = editor.getDetailsForFile('infoCourse.json');
    assert.equal(details.type, 'course');
  });

  it('gets details for course instance info file', () => {
    const details = editor.getDetailsForFile(
      'courseInstances/testinstance/infoCourseInstance.json',
    ) as editor.CourseInstanceInfo;
    assert.equal(details.type, 'courseInstance');
    assert.equal(details.ciid, 'testinstance');
  });

  it('gets details for question info', () => {
    const details = editor.getDetailsForFile(
      'questions/testquestion/info.json',
    ) as editor.QuestionInfo;
    assert.equal(details.type, 'question');
    assert.equal(details.qid, 'testquestion');
  });

  it('gets details for assessment info file', () => {
    const details = editor.getDetailsForFile(
      'courseInstances/testinstance/assessments/testassessment/infoAssessment.json',
    ) as editor.AssessmentInfo;
    assert.equal(details.type, 'assessment');
    assert.equal(details.ciid, 'testinstance');
    assert.equal(details.aid, 'testassessment');
  });
});
