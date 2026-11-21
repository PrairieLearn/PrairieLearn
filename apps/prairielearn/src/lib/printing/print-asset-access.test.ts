import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => vi.useRealTimers());

describe('print asset access', () => {
  it('expires print asset credentials after five minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { token } = beginPrintAssetAccess(scope, secretKey);
    expect(checkPrintAssetAccess(token, secretKey)).toEqual(scope);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(checkPrintAssetAccess(token, secretKey)).toBeNull();
  });

  it('allows scoped asset paths and rejects unrelated paths', () => {
    const base = '/pl/course_instance/10/instructor';
    expect(classifyPrintAssetPath('/assets/image.png', null, '/assets')).toEqual({
      type: 'public',
    });
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
      `${base}/assessment/20/questions`,
    ]) {
      expect(classifyPrintAssetPath(path, scope, '/assets')).toBeNull();
    }
  });
});
