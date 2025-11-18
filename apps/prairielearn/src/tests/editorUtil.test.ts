import { assert, describe, it } from 'vitest';

import { getDetailsForFile } from '../lib/editorUtil.js';
import {
  type AssessmentInfo,
  type CourseInstanceInfo,
  type QuestionInfo,
} from '../lib/editorUtil.types.js';

describe('editor library', () => {
  it('gets details for course info file', () => {
    const details = getDetailsForFile('infoCourse.json');
    assert.equal(details.type, 'course');
  });

  it('gets details for course instance info file', () => {
    const details = getDetailsForFile(
      'courseInstances/testinstance/infoCourseInstance.json',
    ) as CourseInstanceInfo;
    assert.equal(details.type, 'courseInstance');
    assert.equal(details.ciid, 'testinstance');
  });

  it('gets details for question info', () => {
    const details = getDetailsForFile('questions/testquestion/info.json') as QuestionInfo;
    assert.equal(details.type, 'question');
    assert.equal(details.qid, 'testquestion');
  });

  it('gets details for assessment info file', () => {
    const details = getDetailsForFile(
      'courseInstances/testinstance/assessments/testassessment/infoAssessment.json',
    ) as AssessmentInfo;
    assert.equal(details.type, 'assessment');
    assert.equal(details.ciid, 'testinstance');
    assert.equal(details.aid, 'testassessment');
  });
});
