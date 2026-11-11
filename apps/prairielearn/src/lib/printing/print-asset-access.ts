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

const AssetScopeDataSchema = z.strictObject({
  courseInstanceId: IdSchema,
  assessmentId: IdSchema,
  authnUserId: IdSchema,
  userId: IdSchema,
});

export const PrintAssetScopeDataSchema = AssetScopeDataSchema.extend({
  purpose: z.literal('printing').optional(),
  printFormId: IdSchema,
  printFormQuestionIds: z.array(IdSchema),
});
const AiGradingAssetScopeDataSchema = AssetScopeDataSchema.extend({
  purpose: z.literal('ai_grading'),
  assessmentInstanceId: IdSchema,
  instanceQuestionIds: z.array(IdSchema),
});

const PrintAssetScopeSchema = z.discriminatedUnion('purpose', [
  PrintAssetScopeDataSchema.extend({ jobId: z.uuid() }),
  AiGradingAssetScopeDataSchema.extend({ jobId: z.uuid() }),
]);
export type PrintFormAssetScope = z.infer<typeof PrintAssetScopeDataSchema>;
export type PrintAssetScope = PrintFormAssetScope | z.infer<typeof AiGradingAssetScopeDataSchema>;

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
      kind: 'clientFilesCourse' | 'clientFilesQuestion' | 'generatedFilesQuestion';
      printFormQuestionId: string;
    }
  | {
      type: 'instance_question';
      kind: 'clientFilesCourse' | 'clientFilesQuestion' | 'generatedFilesQuestion';
      instanceQuestionId: string;
    }
  | { type: 'elements' };

export function classifyPrintAssetPath(
  pathname: string,
  scope: PrintAssetScope | null,
  assetsPrefix: string,
): PrintAssetRoute | null {
  const assetRoot = assetsPrefix.replace(/\/$/, '');
  if (pathname.startsWith(`${assetRoot}/`) || pathname.startsWith('/pl/static/elements/')) {
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
        | 'clientFilesAssessment'
        | 'clientFilesCourse'
        | 'clientFilesCourseInstance',
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
    scope.purpose === 'ai_grading'
      ? /^instance_question\/(\d+)\/(clientFilesCourse|clientFilesQuestion|generatedFilesQuestion)\/(.+)$/.exec(
          relativePath,
        )
      : new RegExp(
          `^assessment/${scope.assessmentId}/print_form/${scope.printFormId}/question/(\\d+)/(clientFilesCourse|clientFilesQuestion|generatedFilesQuestion)/(.+)$`,
        ).exec(relativePath);
  const questionIds =
    scope.purpose === 'ai_grading' ? scope.instanceQuestionIds : scope.printFormQuestionIds;
  if (questionMatch && questionIds.includes(questionMatch[1])) {
    if (
      questionMatch[2] === 'generatedFilesQuestion' &&
      !/^variant\/\d+\/.+$/.test(questionMatch[3])
    ) {
      return null;
    }
    const kind = questionMatch[2] as
      | 'clientFilesCourse'
      | 'clientFilesQuestion'
      | 'generatedFilesQuestion';
    return scope.purpose === 'ai_grading'
      ? { type: 'instance_question', instanceQuestionId: questionMatch[1], kind }
      : { type: 'question', printFormQuestionId: questionMatch[1], kind };
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
