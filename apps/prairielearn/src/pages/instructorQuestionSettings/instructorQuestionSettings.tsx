import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';
import * as shlex from 'shlex';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { run } from '@prairielearn/run';
import {
  ArrayFromStringOrArraySchema,
  BooleanFromCheckboxSchema,
  IntegerFromStringOrEmptySchema,
} from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import {
  StaffCourseInstanceSchema,
  StaffQuestionSchema,
  StaffTagSchema,
  StaffTopicSchema,
} from '../../lib/client/safe-db-types.js';
import { copyQuestionBetweenCourses } from '../../lib/copy-content.js';
import { EnumGradingMethodSchema } from '../../lib/db-types.js';
import { getOriginalHash } from '../../lib/editorUtil.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  FileModifyEditor,
  MultiEditor,
  QuestionCopyEditor,
  QuestionDeleteEditor,
  QuestionRenameEditor,
} from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { courseRepoContentUrl } from '../../lib/github.js';
import { idsEqual } from '../../lib/id.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { applyKeyOrder } from '../../lib/json.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { selectQuestionsBlockingDeletion } from '../../lib/question-deletion-validation.js';
import { validatePreferencesSchema } from '../../lib/question-settings/validation.js';
import { startTestQuestion } from '../../lib/question-testing.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { validateShortName } from '../../lib/short-name.js';
import { getCanonicalHost } from '../../lib/url.js';
import { generateCsrfToken } from '../../middlewares/csrfToken.js';
import { selectCoursesWithEditAccess } from '../../models/course.js';
import { selectQuestionByUuid } from '../../models/question.js';
import {
  type QuestionSharingSetRow,
  selectQuestionSharingConstraints,
  selectSharingSetsForQuestion,
} from '../../models/sharing-set.js';
import { selectTagsByCourseId, selectTagsByQuestionId } from '../../models/tags.js';
import { selectTopicsByCourseId } from '../../models/topics.js';
import type { QuestionPreferencesSchemaJson } from '../../schemas/infoQuestion.js';

import { InstructorQuestionSettingsForm } from './instructorQuestionSettings.html.js';
import {
  EditableCourseSchema,
  SelectedAssessmentsSchema,
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
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
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
        course_instance: res.locals.course_instance ?? null,
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
          course_instance: res.locals.course_instance ?? null,
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

      // The preferences editor is a hydrated React component embedded in an
      // otherwise server-rendered form, so its values arrive here as flat
      // `preferences.<index>.<field>` keys via a native form POST. We
      // reconstruct the nested array here before Zod validation. Once the
      // question settings page is fully migrated to React + tRPC, the client
      // will post the preferences as JSON directly and this block can go away.
      // See https://github.com/PrairieLearn/PrairieLearn/issues/14656.
      const preferencesArray: Record<string, string>[] = [];
      for (const [key, value] of Object.entries(req.body)) {
        const match = key.match(/^preferences\.(\d+)\.(\w+)$/);
        if (match) {
          const index = Number(match[1]);
          const field = match[2];
          if (!preferencesArray[index]) preferencesArray[index] = {};
          preferencesArray[index][field] = value as string;
        }
      }
      req.body.preferences = preferencesArray.filter(Boolean);

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
          partial_credit: BooleanFromCheckboxSchema,
          workspace_image: z.string().optional(),
          workspace_port: IntegerFromStringOrEmptySchema.nullable().optional(),
          workspace_home: z.string().optional(),
          workspace_args: ArgumentsSchema,
          workspace_rewrite_url: z.enum(['true', 'false', 'null']).default('null'),
          workspace_graded_files: GradedFilesSchema,
          workspace_enable_networking: BooleanFromCheckboxSchema,
          workspace_environment: z.string().optional(),
          preferences: z
            .array(
              z.object({
                name: z.string().min(1, 'Preference name is required'),
                type: z.enum(['string', 'number', 'boolean']),
                default: z.string().min(1, 'Default value is required'),
                enum: z
                  .string()
                  .optional()
                  .transform((val, ctx): string[] => {
                    if (!val || val === '[]') return [];
                    try {
                      const parsed: unknown = JSON.parse(val);
                      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
                        return parsed;
                      }
                    } catch {
                      // Fall through to error
                    }
                    ctx.addIssue({
                      code: 'custom',
                      message: 'Invalid enum format',
                    });
                    return z.NEVER;
                  }),
              }),
            )
            .superRefine((prefs, ctx) => {
              const names = new Set<string>();
              prefs.forEach((pref, i) => {
                if (names.has(pref.name)) {
                  ctx.addIssue({
                    code: 'custom',
                    message: `Duplicate preference name: "${pref.name}"`,
                    path: [i, 'name'],
                  });
                }
                names.add(pref.name);
              });
            })
            .default([]),
          external_grading_image: z.string().optional(),
          external_grading_files: GradedFilesSchema,
          external_grading_entrypoint: ArgumentsSchema,
          external_grading_timeout: IntegerFromStringOrEmptySchema.optional(),
          external_grading_enable_networking: BooleanFromCheckboxSchema,
          external_grading_environment: z.string().optional(),
          share_publicly: BooleanFromCheckboxSchema,
          share_source_publicly: BooleanFromCheckboxSchema,
          sharing_sets: ArrayFromStringOrArraySchema.optional(),
        })
        .parse(req.body);

      const shortNameValidation = validateShortName(body.qid, res.locals.question.qid ?? undefined);
      if (!shortNameValidation.valid) {
        throw new error.HttpStatusError(
          400,
          `Invalid QID: ${shortNameValidation.lowercaseMessage}`,
        );
      }

      const sharingEnabled = await features.enabledFromLocals('question-sharing', res.locals);
      let resolvedSharingSets: string[] | undefined;
      if (sharingEnabled) {
        const sharingSetRows = await selectSharingSetsForQuestion({
          question_id: res.locals.question.id,
          course_id: res.locals.course.id,
        });
        const sharingConstraints = await selectQuestionSharingConstraints({
          question_id: res.locals.question.id,
          course_id: res.locals.course.id,
        });

        if (
          res.locals.question.share_publicly &&
          !body.share_publicly &&
          sharingConstraints.used_in_other_course
        ) {
          throw new error.HttpStatusError(
            400,
            'This question is used by another course, so it cannot be un-shared publicly.',
          );
        }

        if (
          sharingConstraints.used_in_same_course_public_assessment &&
          !body.share_publicly &&
          !body.share_source_publicly
        ) {
          throw new error.HttpStatusError(
            400,
            'This question is used in a publicly shared assessment, so it must remain publicly shared or have its source publicly shared for copying.',
          );
        }

        const validSetNames = new Set(sharingSetRows.map((r) => r.name));
        const requestedSetNames = new Set(body.sharing_sets);

        for (const name of requestedSetNames) {
          if (!validSetNames.has(name)) {
            throw new error.HttpStatusError(400, `Unknown sharing set: "${name}"`);
          }
        }
        resolvedSharingSets = [...requestedSetNames];
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

      questionInfo.partialCredit = propertyValueWithDefault(
        questionInfo.partialCredit,
        body.partial_credit,
        res.locals.question.type === 'Freeform',
      );

      if (sharingEnabled) {
        questionInfo.sharePublicly = propertyValueWithDefault(
          questionInfo.sharePublicly,
          body.share_publicly,
          false,
        );
        questionInfo.shareSourcePublicly = propertyValueWithDefault(
          questionInfo.shareSourcePublicly,
          body.share_source_publicly,
          false,
        );
        questionInfo.sharingSets = propertyValueWithDefault(
          questionInfo.sharingSets,
          resolvedSharingSets,
          (val: any) => !val || val.length === 0,
        );
      }

      if (body.preferences.length > 0) {
        const preferencesSchema: QuestionPreferencesSchemaJson = {};
        for (const pref of body.preferences) {
          const parsedDefault =
            pref.type === 'number'
              ? Number(pref.default)
              : pref.type === 'boolean'
                ? pref.default === 'true'
                : pref.default;

          const parsedEnum =
            pref.enum.length > 0
              ? pref.type === 'number'
                ? pref.enum.map(Number)
                : pref.enum
              : undefined;

          preferencesSchema[pref.name] = {
            type: pref.type,
            default: parsedDefault,
            ...(parsedEnum && { enum: parsedEnum }),
          };
        }
        const preferenceErrors = validatePreferencesSchema(preferencesSchema);
        if (preferenceErrors.length > 0) {
          throw new error.HttpStatusError(400, preferenceErrors.join('; '));
        }
        questionInfo.preferences = preferencesSchema;
      } else {
        delete questionInfo.preferences;
      }

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
        rewriteUrl:
          body.workspace_rewrite_url === 'null' ? undefined : body.workspace_rewrite_url === 'true',
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
      // image. Client-side validation will ensure that it is present if a
      // workspace is configured.
      if (workspaceOptions.image) {
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
      const usedInOtherCourses = await selectQuestionsBlockingDeletion({
        course: res.locals.course,
        questions: [res.locals.question],
      });

      if (usedInOtherCourses.length > 0) {
        flash(
          'error',
          'This question is used by another course and cannot be deleted. Unshare it or remove it from those assessments first.',
        );
        return res.redirect(req.originalUrl);
      }

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
    const { course, authz_data, __csrf_token, authn_user, is_administrator } = extractPageContext(
      res.locals,
      {
        pageType: 'course',
        accessType: 'instructor',
      },
    );
    const question = StaffQuestionSchema.parse(res.locals.question);
    const topic = StaffTopicSchema.parse(res.locals.topic);
    const courseInstance =
      StaffCourseInstanceSchema.nullish().parse(res.locals.course_instance) ?? null;
    const userId = res.locals.user.id;

    if (question.course_id !== course.id) {
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
      authnUserId: authn_user.id,
    });

    const questionGHLink = courseRepoContentUrl(course, `questions/${question.qid}`);

    const qids = await sqldb.queryScalars(sql.qids, { course_id: course.id }, z.string());

    const assessmentsWithQuestion = await sqldb.queryRows(
      sql.select_assessments_with_question_for_display,
      { question_id: question.id },
      SelectedAssessmentsSchema,
    );

    const courseTopics = await selectTopicsByCourseId(course.id);
    const courseTags = await selectTagsByCourseId(course.id);
    const questionTags = await selectTagsByQuestionId(question.id);

    const sharingEnabled = await features.enabledFromLocals('question-sharing', res.locals);

    let sharingSets: QuestionSharingSetRow[] | undefined;
    let sharingConstraints:
      Awaited<ReturnType<typeof selectQuestionSharingConstraints>> | undefined;
    if (sharingEnabled) {
      sharingSets = await selectSharingSetsForQuestion({
        question_id: question.id,
        course_id: course.id,
      });
      sharingConstraints = await selectQuestionSharingConstraints({
        question_id: question.id,
        course_id: course.id,
      });
    }
    const editableCourses = await selectCoursesWithEditAccess({
      user_id: userId,
      is_administrator,
    });
    const fullInfoPath = path.join(course.path, 'questions', question.qid!, 'info.json');

    const origHash = (await getOriginalHash(fullInfoPath)) ?? '';

    const canEdit = authz_data.has_course_permission_edit && !course.example_course;
    const hasCoursePermissionView = authz_data.has_course_permission_view;

    const parsedCourseTopics = z.array(StaffTopicSchema).parse(courseTopics);
    const parsedCourseTags = z.array(StaffTagSchema).parse(courseTags);
    const parsedQuestionTags = z.array(StaffTagSchema).parse(questionTags);
    const parsedEditableCourses = z.array(EditableCourseSchema).parse(editableCourses);

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Settings',
        headContent: [compiledStylesheetTag('instructorQuestionSettings.css')],
        navContext: {
          type: 'instructor',
          page: 'question',
          subPage: 'settings',
        },
        options: {
          pageNote: question.qid!,
        },
        content: (
          <Hydrate>
            <InstructorQuestionSettingsForm
              question={question}
              topic={topic}
              courseInstance={courseInstance}
              csrfToken={__csrf_token}
              questionGHLink={questionGHLink}
              questionTest={{ path: questionTestPath, csrfToken: questionTestCsrfToken }}
              questionTags={parsedQuestionTags}
              qids={qids}
              assessmentsWithQuestion={assessmentsWithQuestion}
              sharing={{
                enabled: sharingEnabled,
                sets: sharingSets ?? [],
                constraints: sharingConstraints ?? {
                  used_in_other_course: false,
                  used_in_same_course_public_assessment: false,
                  locked_sharing_set_names: [],
                },
              }}
              editableCourses={parsedEditableCourses}
              origHash={origHash}
              canEdit={canEdit}
              hasCoursePermissionView={hasCoursePermissionView}
              courseTopics={parsedCourseTopics}
              courseTags={parsedCourseTags}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
