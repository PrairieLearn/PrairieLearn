import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  type SecretKey,
  generateSignedToken,
  getCheckedSignedTokenData,
} from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

export const PRINT_ASSET_TOKEN_HEADER = 'X-PL-Print-Asset-Token';
const PRINT_ASSET_TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

export const PrintAssetScopeSchema = z.strictObject({
  jobId: z.uuid(),
  courseInstanceId: IdSchema,
  assessmentId: IdSchema,
  assessmentInstanceId: IdSchema,
  instanceQuestionIds: z.array(IdSchema),
  authnUserId: IdSchema,
  userId: IdSchema,
});

export const PrintAssetScopeDataSchema = PrintAssetScopeSchema.omit({ jobId: true });
export type PrintAssetScope = z.infer<typeof PrintAssetScopeDataSchema>;

export function beginPrintAssetAccess(scope: PrintAssetScope, secretKey: SecretKey) {
  const jobId = randomUUID();
  return {
    token: generateSignedToken({ ...scope, jobId }, secretKey),
    scope,
  };
}

export function checkPrintAssetAccess(token: string, secretKey: SecretKey): PrintAssetScope | null {
  const result = PrintAssetScopeSchema.safeParse(
    getCheckedSignedTokenData(token, secretKey, { maxAge: PRINT_ASSET_TOKEN_MAX_AGE_MS }),
  );
  if (!result.success) return null;
  const { jobId: _jobId, ...scope } = result.data;
  return scope;
}

export type PrintAssetRoute =
  | { type: 'public' }
  | {
      type: 'assessment';
      kind: 'clientFilesAssessment' | 'clientFilesCourse' | 'clientFilesCourseInstance';
    }
  | { type: 'course'; kind: 'clientFilesCourse' | 'clientFilesCourseInstance' }
  | {
      type: 'question';
      kind: 'clientFilesCourse' | 'clientFilesQuestion' | 'generatedFilesQuestion' | 'file';
      instanceQuestionId: string;
    }
  | { type: 'elements' };

export function classifyPrintAssetPath(
  pathname: string,
  scope: PrintAssetScope | null,
  assetsPrefix: string,
): PrintAssetRoute | null {
  const assetRoot = assetsPrefix.replace(/\/$/, '');
  if (
    pathname.startsWith(`${assetRoot}/`) ||
    pathname.startsWith('/pl/static/elements/') ||
    pathname.startsWith('/localscripts/calculationQuestion/')
  ) {
    return { type: 'public' };
  }
  if (!scope) return null;

  const prefix = `/pl/course_instance/${scope.courseInstanceId}/instructor/`;
  if (!pathname.startsWith(prefix)) return null;
  const relativePath = pathname.slice(prefix.length);
  const assessmentMatch = new RegExp(
    `^assessment/${scope.assessmentId}/(clientFilesAssessment|clientFilesCourse|clientFilesCourseInstance)/.+$`,
  ).exec(relativePath);
  if (assessmentMatch) {
    return {
      type: 'assessment',
      kind: assessmentMatch[1] as
        'clientFilesAssessment' | 'clientFilesCourse' | 'clientFilesCourseInstance',
    };
  }
  const courseMatch = /^(clientFilesCourse|clientFilesCourseInstance)\/.+$/.exec(relativePath);
  if (courseMatch) {
    return {
      type: 'course',
      kind: courseMatch[1] as 'clientFilesCourse' | 'clientFilesCourseInstance',
    };
  }
  const questionMatch =
    /^instance_question\/(\d+)\/(clientFilesCourse|clientFilesQuestion|generatedFilesQuestion|file)\/(.+)$/.exec(
      relativePath,
    );
  if (questionMatch && scope.instanceQuestionIds.includes(questionMatch[1])) {
    if (
      questionMatch[2] === 'generatedFilesQuestion' &&
      !/^variant\/\d+\/.+$/.test(questionMatch[3])
    ) {
      return null;
    }
    return {
      type: 'question',
      instanceQuestionId: questionMatch[1],
      kind: questionMatch[2] as
        'clientFilesCourse' | 'clientFilesQuestion' | 'generatedFilesQuestion' | 'file',
    };
  }
  if (
    /^(?:sharedElements\/course\/\d+\/)?(?:cacheableElements\/[^/]+|elements)\/.+$/.test(
      relativePath,
    ) ||
    /^(?:cacheableElementExtensions\/[^/]+|elementExtensions)\/.+$/.test(relativePath)
  ) {
    return { type: 'elements' };
  }
  return null;
}
