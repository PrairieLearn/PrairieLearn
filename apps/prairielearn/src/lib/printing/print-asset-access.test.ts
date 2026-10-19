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
  assessmentInstanceId: '30',
  instanceQuestionIds: ['40'],
  authnUserId: '50',
  userId: '50',
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
    const otherInstance = beginPrintAssetAccess(
      { ...scope, courseInstanceId: '11', assessmentInstanceId: '31' },
      secretKey,
    );
    expect(
      classifyPrintAssetPath(
        '/pl/course_instance/10/instructor/assessment/20/clientFilesAssessment/diagram.png',
        checkPrintAssetAccess(otherInstance.token, secretKey),
        '/assets',
      ),
    ).toBeNull();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(checkPrintAssetAccess(first.token, secretKey)).toBeNull();
    expect(checkPrintAssetAccess(second.token, secretKey)).toBeNull();
    expect(checkPrintAssetAccess(otherInstance.token, secretKey)).toBeNull();
  });

  it('allows only the selected assessment instance and question assets', () => {
    const base = '/pl/course_instance/10/instructor';
    expect(classifyPrintAssetPath('/assets/image.png', scope, '/assets')).toEqual({
      type: 'public',
    });
    expect(classifyPrintAssetPath('/assets/image.png', null, '/assets')).toEqual({
      type: 'public',
    });
    expect(
      classifyPrintAssetPath('/localscripts/calculationQuestion/underscore.js', null, '/assets'),
    ).toEqual({ type: 'public' });
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
        `${base}/instance_question/40/clientFilesQuestion/image.png`,
        scope,
        '/assets',
      ),
    ).toEqual({ type: 'question', kind: 'clientFilesQuestion', instanceQuestionId: '40' });
    expect(
      classifyPrintAssetPath(
        `${base}/instance_question/40/generatedFilesQuestion/variant/60/plot.png`,
        scope,
        '/assets',
      ),
    ).toEqual({ type: 'question', kind: 'generatedFilesQuestion', instanceQuestionId: '40' });
    for (const path of [
      `${base}/assessment/21/clientFilesAssessment/diagram.png`,
      `${base}/instance_question/41/clientFilesQuestion/image.png`,
      `${base}/assessment/20/questions`,
      '/pl/course_instance/11/instructor/instance_question/40/clientFilesQuestion/image.png',
    ]) {
      expect(classifyPrintAssetPath(path, scope, '/assets')).toBeNull();
    }
  });
});
