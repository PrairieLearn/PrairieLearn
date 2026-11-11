import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateSignedToken } from '@prairielearn/signed-token';

import {
  type PrintAssetScope,
  beginPrintAssetAccess,
  checkPrintAssetAccess,
  classifyPrintAssetPath,
} from './print-asset-access.js';

const secretKey = 'print-asset-test-key';
const scope: PrintAssetScope = {
  courseInstanceId: '10',
  assessmentId: '20',
  printFormId: '30',
  printFormQuestionIds: ['40'],
  authnUserId: '50',
  userId: '50',
};
const aiScope: PrintAssetScope = {
  courseInstanceId: '10',
  assessmentId: '20',
  assessmentInstanceId: '30',
  instanceQuestionIds: ['40'],
  authnUserId: '50',
  userId: '50',
  purpose: 'ai_grading',
};

afterEach(() => vi.useRealTimers());

describe('print asset access', () => {
  it('issues distinct credentials that expire after five minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = beginPrintAssetAccess(scope, secretKey);
    const second = beginPrintAssetAccess(scope, secretKey);
    expect(first.token).not.toBe(second.token);
    expect(checkPrintAssetAccess(first.token, secretKey)).toEqual(scope);
    expect(checkPrintAssetAccess(second.token, secretKey)).toEqual(scope);
    const otherForm = beginPrintAssetAccess(
      { ...scope, courseInstanceId: '11', printFormId: '31' },
      secretKey,
    );
    expect(
      classifyPrintAssetPath(
        '/pl/course_instance/10/instructor/assessment/20/clientFilesAssessment/diagram.png',
        checkPrintAssetAccess(otherForm.token, secretKey),
        '/assets',
      ),
    ).toBeNull();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(checkPrintAssetAccess(first.token, secretKey)).toBeNull();
    expect(checkPrintAssetAccess(second.token, secretKey)).toBeNull();
    expect(checkPrintAssetAccess(otherForm.token, secretKey)).toBeNull();
  });

  it('allows only the selected form and question assets', () => {
    const base = '/pl/course_instance/10/instructor';
    expect(classifyPrintAssetPath('/assets/image.png', scope, '/assets')).toEqual({
      type: 'public',
    });
    expect(classifyPrintAssetPath('/assets/image.png', null, '/assets')).toEqual({
      type: 'public',
    });
    expect(classifyPrintAssetPath('/localscripts/private.js', null, '/assets')).toBeNull();
    expect(
      classifyPrintAssetPath(
        `${base}/assessment/20/clientFilesAssessment/diagram.png`,
        null,
        '/assets',
      ),
    ).toBeNull();
    expect(
      classifyPrintAssetPath(
        `${base}/assessment/20/clientFilesAssessment/diagram.png`,
        scope,
        '/assets',
      ),
    ).toEqual({ type: 'assessment', kind: 'clientFilesAssessment' });
    expect(
      classifyPrintAssetPath(
        `${base}/assessment/20/print_form/30/question/40/clientFilesQuestion/image.png`,
        scope,
        '/assets',
      ),
    ).toEqual({ type: 'question', kind: 'clientFilesQuestion', printFormQuestionId: '40' });
    expect(
      classifyPrintAssetPath(
        `${base}/assessment/20/print_form/30/question/40/generatedFilesQuestion/variant/60/plot.png`,
        scope,
        '/assets',
      ),
    ).toEqual({ type: 'question', kind: 'generatedFilesQuestion', printFormQuestionId: '40' });
    for (const path of [
      `${base}/assessment/21/clientFilesAssessment/diagram.png`,
      `${base}/assessment/20/print_form/30/question/41/clientFilesQuestion/image.png`,
      `${base}/assessment/20/print_form/31/question/40/clientFilesQuestion/image.png`,
      `${base}/instance_question/40/clientFilesQuestion/image.png`,
      `${base}/assessment/20/print_form/30/question/40/file/private.png`,
      `${base}/assessment/20/questions`,
      '/pl/course_instance/11/instructor/assessment/20/print_form/30/question/40/clientFilesQuestion/image.png',
    ]) {
      expect(classifyPrintAssetPath(path, scope, '/assets')).toBeNull();
    }
  });

  it('binds the rendering purpose to the signed credential', () => {
    const { token } = beginPrintAssetAccess(aiScope, secretKey);
    expect(checkPrintAssetAccess(token, secretKey)).toEqual(aiScope);
    expect(checkPrintAssetAccess(beginPrintAssetAccess(scope, secretKey).token, secretKey)).toEqual(
      scope,
    );
  });

  it('keeps AI grading instance assets separate from print-form assets', () => {
    const base = '/pl/course_instance/10/instructor';
    for (const [kind, filename] of [
      ['clientFilesQuestion', 'image.png'],
      ['clientFilesCourse', 'data.txt'],
      ['generatedFilesQuestion', 'variant/60/plot.png'],
    ]) {
      expect(
        classifyPrintAssetPath(
          `${base}/instance_question/40/${kind}/${filename}`,
          aiScope,
          '/assets',
        ),
      ).toEqual({ type: 'instance_question', instanceQuestionId: '40', kind });
    }
    for (const path of [
      `${base}/instance_question/41/clientFilesQuestion/image.png`,
      `${base}/instance_question/40/generatedFilesQuestion/submission/60/plot.png`,
      `${base}/instance_question/40/file/private.png`,
      `${base}/assessment/20/print_form/30/question/40/clientFilesQuestion/image.png`,
    ]) {
      expect(classifyPrintAssetPath(path, aiScope, '/assets')).toBeNull();
    }
    const mismatchedToken = generateSignedToken(
      { ...scope, purpose: 'ai_grading', jobId: crypto.randomUUID() },
      secretKey,
    );
    expect(checkPrintAssetAccess(mismatchedToken, secretKey)).toBeNull();
  });
});
