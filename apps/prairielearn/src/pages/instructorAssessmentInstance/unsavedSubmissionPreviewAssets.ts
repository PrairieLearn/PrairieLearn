import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { getCheckedSignedTokenData } from '@prairielearn/signed-token';
import { IdSchema, parseRequestParams } from '@prairielearn/zod';

import { calculateCourseInstanceRolePermissions } from '../../lib/authz-data-lib.js';
import { selectCourseInstanceRole } from '../../lib/authz-data.js';
import { config } from '../../lib/config.js';
import type { Course, Question } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { writeCourseIssues } from '../../lib/issues.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { parseUnsavedSubmissionForPreview } from '../../lib/unsaved-submission-preview.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionByInstanceQuestionId } from '../../models/question.js';
import {
  selectOptionalUnsavedSubmissionForAssessment,
  selectOptionalUnsavedSubmissionMetadataForAssessment,
} from '../../models/unsaved-submission.js';
import { selectUserIsAdministrator } from '../../models/user.js';
import * as questionServers from '../../question-servers/index.js';
import clientFilesCourse from '../clientFilesCourse/clientFilesCourse.js';
import clientFilesQuestion from '../clientFilesQuestion/clientFilesQuestion.js';
import elementExtensionFiles from '../elementExtensionFiles/elementExtensionFiles.js';
import elementFiles from '../elementFiles/elementFiles.js';
import legacyQuestionFile from '../legacyQuestionFile/legacyQuestionFile.js';
import { guessMimeType } from '../submissionFile/submissionFile.js';

const router = Router({ mergeParams: true });
const PREVIEW_TOKEN_MAX_AGE_MS = 10 * 60 * 1000;
const ParamsSchema = z.object({
  unsafe_unsaved_submission_id: IdSchema,
  token: z.string(),
});
const TokenSchema = z.object({
  type: z.literal('unsaved-submission-preview'),
  unsaved_submission_id: IdSchema,
  assessment_id: IdSchema,
  course_id: IdSchema,
  course_instance_id: IdSchema,
  variant_id: IdSchema,
  authn_user_id: IdSchema,
  revision: z.string(),
});
interface PreviewLocals {
  course: Course;
  question: Question;
  previewScope: z.infer<typeof TokenSchema>;
}

router.use(
  typedAsyncHandler<'plain', PreviewLocals>(async (req, res, next) => {
    const params = parseRequestParams(req, ParamsSchema);
    const token = TokenSchema.safeParse(
      getCheckedSignedTokenData(params.token, config.secretKey, {
        maxAge: PREVIEW_TOKEN_MAX_AGE_MS,
      }),
    );
    if (
      !token.success ||
      token.data.unsaved_submission_id !== params.unsafe_unsaved_submission_id
    ) {
      throw new HttpStatusError(403, 'Invalid unsaved submission preview token');
    }
    const scope = token.data;
    const draftData = await selectOptionalUnsavedSubmissionMetadataForAssessment({
      unsaved_submission_id: scope.unsaved_submission_id,
      assessment_id: scope.assessment_id,
    });
    if (
      !draftData ||
      draftData.variant_invalidated ||
      draftData.revision !== scope.revision ||
      draftData.unsaved_submission.variant_id !== scope.variant_id
    ) {
      throw new HttpStatusError(404, 'Unsaved submission preview is no longer available');
    }
    // The sandbox cannot use session cookies to recheck the viewer's current access.
    const role = await selectCourseInstanceRole({
      courseInstanceId: scope.course_instance_id,
      userId: scope.authn_user_id,
    });
    if (
      !calculateCourseInstanceRolePermissions(role).has_course_instance_permission_view &&
      !(await selectUserIsAdministrator(scope.authn_user_id))
    ) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const course = await selectCourseById(scope.course_id);
    if (
      !(await features.enabled('unsaved-submissions-ui', {
        institution_id: course.institution_id,
        course_id: course.id,
        course_instance_id: scope.course_instance_id,
        user_id: scope.authn_user_id,
      }))
    ) {
      throw new HttpStatusError(403, 'Unsaved submissions are not available');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "sandbox allow-scripts allow-downloads; frame-ancestors 'self'",
    );
    res.locals.previewScope = scope;
    res.locals.course = course;
    res.locals.question = await selectQuestionByInstanceQuestionId(
      draftData.unsaved_submission.instance_question_id,
    );
    next();
  }),
);

router.use('/clientFilesCourse', clientFilesCourse);
router.use('/clientFilesQuestion', clientFilesQuestion());
router.use('/file', legacyQuestionFile);
router.use(['/elements', '/cacheableElements/:preview_cachebuster'], elementFiles());
router.use(
  ['/elementExtensions', '/cacheableElementExtensions/:preview_cachebuster'],
  elementExtensionFiles,
);
router.use(
  [
    '/sharedElements/course/:producing_course_id(\\d+)/elements',
    '/sharedElements/course/:producing_course_id(\\d+)/cacheableElements/:preview_cachebuster',
  ],
  typedAsyncHandler<'plain', PreviewLocals>(async (req, res, next) => {
    const { producing_course_id } = parseRequestParams(
      req,
      z.object({ producing_course_id: IdSchema }),
    );
    if (producing_course_id !== res.locals.question.course_id) {
      throw new HttpStatusError(404, 'Not Found');
    }
    next();
  }),
  elementFiles(),
);

const FileParamsSchema = z.object({
  unsafe_submission_id: IdSchema,
  0: z.string().min(1),
});
const GeneratedFileParamsSchema = z.object({
  unsafe_variant_id: IdSchema.optional(),
  unsafe_submission_id: IdSchema.optional(),
  0: z.string().min(1),
});

router.get(
  '/submission/:unsafe_submission_id(\\d+)/file/*',
  typedAsyncHandler<'plain', PreviewLocals>(async (req, res) => {
    const params = parseRequestParams(req, FileParamsSchema);
    const scope = res.locals.previewScope;
    if (params.unsafe_submission_id !== scope.unsaved_submission_id) {
      throw new HttpStatusError(404, 'Not Found');
    }
    const draftData = await selectOptionalUnsavedSubmissionForAssessment({
      unsaved_submission_id: scope.unsaved_submission_id,
      assessment_id: scope.assessment_id,
    });
    if (!draftData || draftData.revision !== scope.revision) {
      throw new HttpStatusError(404, 'Unsaved submission preview is no longer available');
    }
    const { submission } = await parseUnsavedSubmissionForPreview({
      draftData,
      course: res.locals.course,
      authnUserId: scope.authn_user_id,
    });
    const files = z
      .array(z.object({ name: z.string(), contents: z.string() }))
      .parse(submission.submitted_answer?._files ?? []);
    const file = files.find((file) => file.name === params[0]);
    if (!file) throw new HttpStatusError(404, 'Not Found');
    const contents = Buffer.from(file.contents, 'base64');
    res.type(await guessMimeType(file.name, contents));
    res.send(contents);
  }),
);

router.get(
  [
    '/generatedFilesQuestion/variant/:unsafe_variant_id(\\d+)/*',
    '/generatedFilesQuestion/submission/:unsafe_submission_id(\\d+)/*',
  ],
  typedAsyncHandler<'plain', PreviewLocals>(async (req, res) => {
    const params = parseRequestParams(req, GeneratedFileParamsSchema);
    const scope = res.locals.previewScope;
    if (
      (params.unsafe_variant_id && params.unsafe_variant_id !== scope.variant_id) ||
      (params.unsafe_submission_id && params.unsafe_submission_id !== scope.unsaved_submission_id)
    ) {
      throw new HttpStatusError(404, 'Not Found');
    }
    const draftData = await selectOptionalUnsavedSubmissionForAssessment({
      unsaved_submission_id: scope.unsaved_submission_id,
      assessment_id: scope.assessment_id,
    });
    if (!draftData || draftData.revision !== scope.revision) {
      throw new HttpStatusError(404, 'Unsaved submission preview is no longer available');
    }
    const { variant, submission, caller, questionCourse } = await parseUnsavedSubmissionForPreview({
      draftData,
      course: res.locals.course,
      authnUserId: scope.authn_user_id,
    });
    const questionModule = questionServers.getModule(draftData.question.type);
    if (!questionModule.file) throw new HttpStatusError(404, 'Not Found');
    const { courseIssues, data } = await questionModule.file({
      filename: params[0],
      variant,
      submission: params.unsafe_submission_id ? submission : null,
      question: draftData.question,
      course: questionCourse,
      caller,
      // Draft-derived variant data has no stored version for the cache key.
      cache: false,
    });
    await writeCourseIssues(
      courseIssues,
      variant,
      draftData.unsaved_submission.user_id,
      scope.authn_user_id,
      'Error creating unsaved submission preview file',
      { variant, question: draftData.question, course: res.locals.course },
    );
    res.attachment(params[0]);
    res.type(await guessMimeType(params[0], data));
    res.send(data);
  }),
);

export default router;
