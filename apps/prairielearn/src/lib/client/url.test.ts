import { assert, describe, it } from 'vitest';

import {
  getAssessmentLogsUrl,
  getAssessmentQuestionEditorUrl,
  getCourseAdminQuestionsUrl,
} from './url.js';

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

  it('links to course admin questions filtered by topic', () => {
    assert.equal(
      getCourseAdminQuestionsUrl({
        courseId: '1',
        filter: { type: 'topic', value: 'Vectors and matrices' },
      }),
      '/pl/course/1/course_admin/questions?topic=Vectors+and+matrices',
    );
  });

  it('prefers the course instance route when filtering course admin questions', () => {
    assert.equal(
      getCourseAdminQuestionsUrl({
        courseId: '1',
        courseInstanceId: '2',
        filter: { type: 'tag', value: 'calculation' },
      }),
      '/pl/course_instance/2/instructor/course_admin/questions?tag=calculation',
    );
  });

  it('links to course instance admin questions without requiring a course ID', () => {
    assert.equal(
      getCourseAdminQuestionsUrl({
        courseInstanceId: '2',
        filter: { type: 'tag', value: 'calculation' },
      }),
      '/pl/course_instance/2/instructor/course_admin/questions?tag=calculation',
    );
  });

  it('links to course admin questions filtered by external grading image', () => {
    assert.equal(
      getCourseAdminQuestionsUrl({
        courseId: '1',
        courseInstanceId: '2',
        filter: { type: 'external_grading_image', value: 'prairielearn/grader-python:latest' },
      }),
      '/pl/course_instance/2/instructor/course_admin/questions?extImage=prairielearn%2Fgrader-python%3Alatest',
    );
  });

  it('links to course admin questions filtered by workspace image', () => {
    assert.equal(
      getCourseAdminQuestionsUrl({
        courseId: '1',
        courseInstanceId: '2',
        filter: { type: 'workspace_image', value: 'prairielearn/workspace-jupyter:latest' },
      }),
      '/pl/course_instance/2/instructor/course_admin/questions?wsImage=prairielearn%2Fworkspace-jupyter%3Alatest',
    );
  });

  it('links to the assessment logs filtered by category', () => {
    assert.equal(
      getAssessmentLogsUrl({ courseInstanceId: '1', assessmentId: '2', category: 'upload' }),
      '/pl/course_instance/1/instructor/assessment/2/logs?category=upload',
    );
  });

  it('escapes commas inside course admin question filters', () => {
    assert.equal(
      getCourseAdminQuestionsUrl({
        courseId: '1',
        filter: { type: 'tag', value: 'a,b' },
      }),
      '/pl/course/1/course_admin/questions?tag=a%252Cb',
    );
  });
});
