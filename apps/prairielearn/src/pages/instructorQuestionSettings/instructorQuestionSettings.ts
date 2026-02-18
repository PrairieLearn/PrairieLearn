import * as path from 'path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import * as shlex from 'shlex';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import {
  ArrayFromStringOrArraySchema,
  BooleanFromCheckboxSchema,
  IntegerFromStringOrEmptySchema,
} from '@prairielearn/zod';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { copyQuestionBetweenCourses } from '../../lib/copy-content.js';
import { EnumGradingMethodSchema } from '../../lib/db-types.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  FileModifyEditor,
  MultiEditor,
  QuestionCopyEditor,
  QuestionDeleteEditor,
  QuestionRenameEditor,
  getOriginalHash,
} from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { courseRepoContentUrl } from '../../lib/github.js';
import { idsEqual } from '../../lib/id.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { applyKeyOrder } from '../../lib/json.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { startTestQuestion } from '../../lib/question-testing.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { validateShortName } from '../../lib/short-name.js';
import { getCanonicalHost } from '../../lib/url.js';
import { generateCsrfToken } from '../../middlewares/csrfToken.js';
import { selectCoursesWithEditAccess } from '../../models/course.js';
import { selectQuestionByUuid } from '../../models/question.js';
import { selectTagsByCourseId, selectTagsByQuestionId } from '../../models/tags.js';
import { selectTopicsByCourseId } from '../../models/topics.js';

import { InstructorQuestionSettings } from './instructorQuestionSettings.html.js';
import {
  SelectedAssessmentsSchema,
  type SharingSetRow,
  SharingSetRowSchema,
} from './instructorQuestionSettings.types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

// This will not correctly handle any filenames that have a comma in them.
// Currently, we do not have any such filenames in prod so we don't think that
// escaping commas in individual filenames is necessary.
const GradedFilesSchema = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  )
  .optional();

const ArgumentsSchema = z
  .string()
  .transform((s) => shlex.split(s || ''))
  .optional();

router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw new error.HttpStatusError(403, 'Access denied');
    }
    // We use a separate `test/` POST route so that we can always use the
    // route to distinguish between pages that need to execute course code
    // (this `test/` handler) and pages that need access to course content
    // editing (here the plain '/' POST handler).
    if (req.body.__action === 'test_once') {
      if (!res.locals.authz_data.has_course_permission_view) {
        throw new error.HttpStatusError(403, 'Access denied (must be a course Viewer)');
      }
      const jobSequenceId = await startTestQuestion({
        count: 1,
        showDetails: true,
        question: res.locals.question,
        course_instance: res.locals.course_instance,
        course: res.locals.course,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        // Optional variant seed prefix for deterministic testing.
        // Not exposed in UI - for internal use with automated testing scripts.
        variantSeedPrefix: req.body.variant_seed_prefix,
      });
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'test_100') {
      if (!res.locals.authz_data.has_course_permission_view) {
        throw new error.HttpStatusError(403, 'Access denied (must be a course Viewer)');
      }
      if (res.locals.question.grading_method !== 'External') {
        const jobSequenceId = await startTestQuestion({
          count: 100,
          showDetails: false,
          question: res.locals.question,
          course_instance: res.locals.course_instance,
          course: res.locals.course,
          user_id: res.locals.user.id,
          authn_user_id: res.locals.authn_user.id,
          // Optional variant seed prefix for deterministic testing.
          // Not exposed in UI - for internal use with automated testing scripts.
          variantSeedPrefix: req.body.variant_seed_prefix,
        });
        res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
      } else {
        throw new Error('Not supported for externally-graded questions');
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.post(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw new error.HttpStatusError(403, 'Access denied');
    }
    if (req.body.__action === 'update_question') {
      const infoPath = path.join(
        res.locals.course.path,
        'questions',
        res.locals.question.qid!,
        'info.json',
      );
      if (!(await fs.pathExists(infoPath))) {
        throw new error.HttpStatusError(400, 'Question info file does not exist');
      }

      const body = z
        .object({
          orig_hash: z.string(),
          qid: z.string(),
          title: z.string(),
          topic: z.string().optional(),
          tags: ArrayFromStringOrArraySchema.optional(),
          grading_method: EnumGradingMethodSchema.optional(),
          single_variant: BooleanFromCheckboxSchema,
          show_correct_answer: BooleanFromCheckboxSchema,
          workspace_image: z.string().optional(),
          workspace_port: IntegerFromStringOrEmptySchema.nullable().optional(),
          workspace_home: z.string().optional(),
          workspace_args: ArgumentsSchema,
          workspace_rewrite_url: BooleanFromCheckboxSchema,
          workspace_graded_files: GradedFilesSchema,
          workspace_enable_networking: BooleanFromCheckboxSchema,
          workspace_environment: z.string().optional(),
          external_grading_enabled: BooleanFromCheckboxSchema,
          external_grading_image: z.string().optional(),
          external_grading_files: GradedFilesSchema,
          external_grading_entrypoint: ArgumentsSchema,
          external_grading_timeout: IntegerFromStringOrEmptySchema.optional(),
          external_grading_enable_networking: BooleanFromCheckboxSchema,
          external_grading_environment: z.string().optional(),
        })
        .parse(req.body);

      const shortNameValidation = validateShortName(body.qid, res.locals.question.qid ?? undefined);
      if (!shortNameValidation.valid) {
        throw new error.HttpStatusError(
          400,
          `Invalid QID: ${shortNameValidation.lowercaseMessage}`,
        );
      }

      const paths = getPaths(undefined, res.locals);

      const questionInfo = JSON.parse(await fs.readFile(infoPath, 'utf8'));

      const origHash = body.orig_hash;
      questionInfo.title = body.title;
      questionInfo.topic = body.topic;
      questionInfo.tags = propertyValueWithDefault(
        questionInfo.tags,
        body.tags,
        (val: any) => !val || val.length === 0,
      );

      questionInfo.gradingMethod = propertyValueWithDefault(
        questionInfo.gradingMethod,
        body.grading_method,
        'Internal',
      );

      questionInfo.singleVariant = propertyValueWithDefault(
        questionInfo.singleVariant,
        body.single_variant,
        false,
      );

      questionInfo.showCorrectAnswer = propertyValueWithDefault(
        questionInfo.showCorrectAnswer,
        body.show_correct_answer,
        true,
      );

      const workspaceOptions = {
        comment: questionInfo.workspaceOptions?.comment ?? undefined,
        image: propertyValueWithDefault(
          questionInfo.workspaceOptions?.image,
          body.workspace_image?.trim(),
          '',
        ),
        port: propertyValueWithDefault(
          questionInfo.workspaceOptions?.port,
          body.workspace_port,
          null,
        ),
        home: propertyValueWithDefault(
          questionInfo.workspaceOptions?.home,
          body.workspace_home?.trim(),
          '',
        ),
        args: propertyValueWithDefault(
          questionInfo.workspaceOptions?.args,
          body.workspace_args,
          (v: any) => !v || v.length === 0,
        ),
        rewriteUrl: propertyValueWithDefault(
          questionInfo.workspaceOptions?.rewriteUrl,
          body.workspace_rewrite_url,
          true,
        ),
        gradedFiles: propertyValueWithDefault(
          questionInfo.workspaceOptions?.gradedFiles,
          body.workspace_graded_files,
          (v: any) => !v || v.length === 0,
        ),
        enableNetworking: propertyValueWithDefault(
          questionInfo.workspaceOptions?.enableNetworking,
          body.workspace_enable_networking,
          false,
        ),
        environment: propertyValueWithDefault(
          questionInfo.workspaceOptions?.environment,
          JSON.parse(body.workspace_environment?.replaceAll('\r\n', '\n') || '{}'),
          (val: any) => !val || Object.keys(val).length === 0,
        ),
      };

      // We'll only write the workspace options if the request contains the
      // required fields. Client-side validation will ensure that these are
      // present if a workspace is configured.
      if (workspaceOptions.image && workspaceOptions.port && workspaceOptions.home) {
        const filteredOptions = Object.fromEntries(
          Object.entries(
            propertyValueWithDefault(
              questionInfo.workspaceOptions,
              workspaceOptions,
              (val: any) => !val || Object.keys(val).length === 0,
            ),
          ).filter(([_, value]) => value !== undefined),
        );
        questionInfo.workspaceOptions =
          Object.keys(filteredOptions).length > 0
            ? applyKeyOrder(questionInfo.workspaceOptions, filteredOptions)
            : undefined;
      } else {
        questionInfo.workspaceOptions = undefined;
      }

      const externalGradingOptions = {
        comment: questionInfo.externalGradingOptions?.comment ?? undefined,
        enabled: propertyValueWithDefault(
          questionInfo.externalGradingOptions?.enabled,
          body.external_grading_enabled,
          false,
        ),
        image: propertyValueWithDefault(
          questionInfo.externalGradingOptions?.image,
          body.external_grading_image,
          '',
        ),
        entrypoint: propertyValueWithDefault(
          questionInfo.externalGradingOptions?.entrypoint,
          body.external_grading_entrypoint,
          (v: any) => v == null || v.length === 0,
        ),
        serverFilesCourse: propertyValueWithDefault(
          questionInfo.externalGradingOptions?.serverFilesCourse,
          body.external_grading_files,
          (v: any) => !v || v.length === 0,
        ),
        timeout: propertyValueWithDefault(
          questionInfo.externalGradingOptions?.timeout,
          body.external_grading_timeout,
          null,
        ),
        enableNetworking: propertyValueWithDefault(
          questionInfo.externalGradingOptions?.enableNetworking,
          body.external_grading_enable_networking,
          false,
        ),
        environment: propertyValueWithDefault(
          questionInfo.externalGradingOptions?.environment,
          JSON.parse(body.external_grading_environment || '{}'),
          (val: any) => !val || Object.keys(val).length === 0,
        ),
      };
      if (externalGradingOptions.image) {
        const filteredExternalGradingOptions = Object.fromEntries(
          Object.entries(
            propertyValueWithDefault(
              questionInfo.externalGradingOptions,
              externalGradingOptions,
              (val: any) => !val || Object.keys(val).length === 0,
            ),
          ).filter(([_, value]) => value !== undefined),
        );

        questionInfo.externalGradingOptions =
          Object.keys(filteredExternalGradingOptions).length > 0
            ? applyKeyOrder(questionInfo.externalGradingOptions, filteredExternalGradingOptions)
            : undefined;
      } else {
        questionInfo.externalGradingOptions = undefined;
      }

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(questionInfo));

      const qid_new = run(() => {
        try {
          return path.normalize(req.body.qid);
        } catch {
          throw new error.HttpStatusError(
            400,
            `Invalid QID (could not be normalized): ${req.body.qid}`,
          );
        }
      });

      const editor = new MultiEditor(
        {
          locals: res.locals,
          // This won't reflect if the operation is an update or a rename; we think that's OK.
          description: `Update question ${res.locals.question.qid}`,
        },
        [
          // Each of these editors will no-op if there wasn't any change.
          new FileModifyEditor({
            locals: res.locals,
            container: {
              rootPath: paths.rootPath,
              invalidRootPaths: paths.invalidRootPaths,
            },
            filePath: path.join(paths.rootPath, 'info.json'),
            editContents: b64EncodeUnicode(formattedJson),
            origHash,
          }),
          new QuestionRenameEditor({
            locals: res.locals,
            qid_new,
          }),
        ],
      );
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      flash('success', 'Question settings updated successfully');
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'copy_question') {
      if (idsEqual(req.body.to_course_id, res.locals.course.id)) {
        // In this case, we are making a duplicate of this question in the same course
        const editor = new QuestionCopyEditor({
          locals: res.locals,
          from_qid: res.locals.question.qid!,
          from_course: res.locals.course,
          from_path: path.join(res.locals.course.path, 'questions', res.locals.question.qid!),
          is_transfer: false,
        });
        const serverJob = await editor.prepareServerJob();
        try {
          await editor.executeWithServerJob(serverJob);
        } catch {
          return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        }

        const question = await selectQuestionByUuid({
          course_id: res.locals.course.id,
          uuid: editor.uuid,
        });

        flash(
          'success',
          'Question copied successfully. You are now viewing your copy of the question.',
        );
        res.redirect(res.locals.urlPrefix + '/question/' + question.id + '/settings');
      } else {
        await copyQuestionBetweenCourses(res, {
          fromCourse: res.locals.course,
          toCourseId: req.body.to_course_id,
          question: res.locals.question,
        });
      }
    } else if (req.body.__action === 'delete_question') {
      const editor = new QuestionDeleteEditor({
        locals: res.locals,
        questions: res.locals.question,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        res.redirect(res.locals.urlPrefix + '/course_admin/questions');
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw new error.HttpStatusError(403, 'Access denied');
    }
    // Construct the path of the question test route. We'll do this based on
    // `originalUrl` so that this router doesn't have to be aware of where it's
    // mounted.
    const host = getCanonicalHost(req);
    let questionTestPath = new URL(req.originalUrl, host).pathname;
    if (!questionTestPath.endsWith('/')) {
      questionTestPath += '/';
    }
    questionTestPath += 'test';

    // Generate a CSRF token for the test route. We can't use `res.locals.__csrf_token`
    // here because this form will actually post to a different route, not `req.originalUrl`.
    const questionTestCsrfToken = generateCsrfToken({
      url: questionTestPath,
      authnUserId: res.locals.authn_user.id,
    });

    const questionGHLink = courseRepoContentUrl(
      res.locals.course,
      `questions/${res.locals.question.qid}`,
    );

    const qids = await sqldb.queryRows(sql.qids, { course_id: res.locals.course.id }, z.string());

    const assessmentsWithQuestion = await sqldb.queryRows(
      sql.select_assessments_with_question_for_display,
      { question_id: res.locals.question.id },
      SelectedAssessmentsSchema,
    );

    const courseTopics = await selectTopicsByCourseId(res.locals.course.id);
    const courseTags = await selectTagsByCourseId(res.locals.course.id);
    const questionTags = await selectTagsByQuestionId(res.locals.question.id);

    const sharingEnabled = await features.enabledFromLocals('question-sharing', res.locals);

    let sharingSetsIn: SharingSetRow[] | undefined;
    if (sharingEnabled) {
      const result = await sqldb.queryRows(
        sql.select_sharing_sets,
        {
          question_id: res.locals.question.id,
          course_id: res.locals.course.id,
        },
        SharingSetRowSchema,
      );
      sharingSetsIn = result.filter((row) => row.in_set);
    }
    const editableCourses = await selectCoursesWithEditAccess({
      user_id: res.locals.user.id,
      is_administrator: res.locals.is_administrator,
    });
    const infoPath = path.join('questions', res.locals.question.qid!, 'info.json');
    const fullInfoPath = path.join(res.locals.course.path, infoPath);

    const origHash = (await getOriginalHash(fullInfoPath)) ?? '';

    const canEdit =
      res.locals.authz_data.has_course_permission_edit && !res.locals.course.example_course;

    res.send(
      InstructorQuestionSettings({
        resLocals: res.locals,
        questionTestPath,
        questionTestCsrfToken,
        questionGHLink,
        questionTags,
        qids,
        assessmentsWithQuestion,
        sharingEnabled,
        sharingSetsIn,
        editableCourses,
        infoPath,
        origHash,
        canEdit,
        courseTopics,
        courseTags,
      }),
    );
  }),
);

export default router;
