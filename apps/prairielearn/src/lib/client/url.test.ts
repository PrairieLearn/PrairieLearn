import { assert, describe, it } from 'vitest';

import { getAssessmentQuestionEditorUrl } from './url.js';

describe('URL helpers', () => {
  it('links to the assessment editor entry for a QID', () => {
    assert.equal(
      getAssessmentQuestionEditorUrl({
        courseInstanceId: '1',
        assessmentId: '2',
        qid: 'test/question',
      }),
      '/pl/course_instance/1/instructor/assessment/2/questions?selected=q:test/question',
    );
  });

  it('escapes QID characters that would change the query string', () => {
    assert.equal(
      getAssessmentQuestionEditorUrl({
        courseInstanceId: '1',
        assessmentId: '2',
        qid: 'test/question & part#1',
      }),
      '/pl/course_instance/1/instructor/assessment/2/questions?selected=q:test/question%20%26%20part%231',
    );
  });
});
