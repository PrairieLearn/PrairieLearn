import * as path from 'node:path';

import { Router } from 'express';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { IdSchema } from '@prairielearn/zod';

import { QuestionContainer } from '../../components/QuestionContainer.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../lib/base64-util.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { type Course, type Question } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { isEnterprise } from '../../lib/license.js';
import {
  DraftFinalizationEditorJobError,
  DraftFinalizationInputError,
  finalizeDraftQuestion,
} from '../../lib/question-drafts.js';
import { getAndRenderVariant } from '../../lib/question-render.js';
import type { ResLocalsQuestionRender } from '../../lib/question-render.types.js';
import { processSubmission } from '../../lib/question-submission.js';
import { HttpRedirect } from '../../lib/redirect.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';
import { validateShortName } from '../../lib/short-name.js';
import { getSearchParams } from '../../lib/url.js';
import { logPageView } from '../../middlewares/logPageView.js';
import { selectQuestionById } from '../../models/question.js';
import { InstructorQuestionDraftEditor } from '../instructorQuestionDraftEditor/instructorQuestionDraftEditor.html.js';

import {
  getEditorUrlWithSelectedFile,
  getSelectedQuestionFilePath,
  normalizeQuestionFilePath,
  readSelectedQuestionFile,
} from './selectedQuestionFile.js';

const router = Router();

interface QuestionFileEntry {
  path: string;
  size: number;
}

function assertCanEditDraft(resLocals: UntypedResLocals) {
  if (!resLocals.authz_data.has_course_permission_edit) {
    throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
  }

  if (resLocals.course.example_course) {
    throw new error.HttpStatusError(403, 'Access denied (cannot edit the example course)');
  }
}

async function listQuestionFiles({
  course,
  question,
}: {
  course: Course;
  question: Question;
}): Promise<QuestionFileEntry[]> {
  if (!question.qid) return [];

  const questionPath = path.join(course.path, 'questions', question.qid);
  const entries: QuestionFileEntry[] = [];

  async function walk(directoryPath: string) {
    const dirents = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const dirent of dirents) {
      const filePath = path.join(directoryPath, dirent.name);
      if (dirent.isDirectory()) {
        await walk(filePath);
      } else if (dirent.isFile()) {
        const stat = await fs.stat(filePath);
        entries.push({
          path: path.relative(questionPath, filePath).split(path.sep).join('/'),
          size: stat.size,
        });
      }
    }
  }

  await walk(questionPath);

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function saveDraftQuestionFiles({
  course,
  question,
  userId,
  authnUserId,
  hasCoursePermissionEdit,
  urlPrefix,
  html,
  python,
}: {
  course: Course;
  question: Question;
  userId: string;
  authnUserId: string;
  hasCoursePermissionEdit: boolean;
  urlPrefix: string;
  html: string;
  python?: string;
}) {
  const client = getCourseFilesClient();

  const files: Record<string, string | null> = {
    'question.html': b64EncodeUnicode(html),
  };

  const trimmedPython = python?.trim() ?? '';
  files['server.py'] = trimmedPython === '' ? null : b64EncodeUnicode(trimmedPython);

  const result = await client.updateQuestionFiles.mutate({
    course_id: course.id,
    user_id: userId,
    authn_user_id: authnUserId,
    question_id: question.id,
    has_course_permission_edit: hasCoursePermissionEdit,
    files,
  });

  if (result.status === 'error') {
    throw new HttpRedirect(urlPrefix + '/edit_error/' + result.job_sequence_id);
  }
}

async function saveDraftQuestionFile({
  course,
  question,
  userId,
  authnUserId,
  hasCoursePermissionEdit,
  urlPrefix,
  filePath,
  contents,
}: {
  course: Course;
  question: Question;
  userId: string;
  authnUserId: string;
  hasCoursePermissionEdit: boolean;
  urlPrefix: string;
  filePath: string;
  contents: string;
}) {
  const client = getCourseFilesClient();

  const result = await client.updateQuestionFiles.mutate({
    course_id: course.id,
    user_id: userId,
    authn_user_id: authnUserId,
    question_id: question.id,
    has_course_permission_edit: hasCoursePermissionEdit,
    files: {
      [filePath]: b64EncodeUnicode(contents),
    },
  });

  if (result.status === 'error') {
    throw new HttpRedirect(urlPrefix + '/edit_error/' + result.job_sequence_id);
  }
}

router.get(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const question = res.locals.question;

    if (!question.draft) {
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
      return;
    }

    if (
      isEnterprise() &&
      (await features.enabledFromLocals('ai-question-generation', res.locals))
    ) {
      const search = getSearchParams(req).toString();
      res.redirect(
        `${res.locals.urlPrefix}/ai_generate_editor/${question.id}/editor${search ? `?${search}` : ''}`,
      );
      return;
    }

    res.redirect(`${res.locals.urlPrefix}/question/${question.id}/draft/editor`);
  }),
);

router.get(
  '/editor',
  typedAsyncHandler<'instructor-question', ResLocalsQuestionRender>(async (req, res) => {
    const question = res.locals.question;

    if (!question.draft) {
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
      return;
    }

    assertCanEditDraft(res.locals);

    const courseFilesClient = getCourseFilesClient();
    const { files: questionFiles } = await courseFilesClient.getQuestionFiles.query({
      course_id: res.locals.course.id,
      question_id: question.id,
    });
    const allQuestionFiles = await listQuestionFiles({
      course: res.locals.course,
      question,
    });

    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;
    const richTextEditorEnabled = await features.enabledFromLocals('rich-text-editor', res.locals);
    const editorUrl = `${res.locals.urlPrefix}/question/${question.id}/draft/editor`;
    const selectedFile = await readSelectedQuestionFile({
      course: res.locals.course,
      question,
      filePath: getSelectedQuestionFilePath(req.query.file),
    });

    await getAndRenderVariant(variant_id, null, res.locals, {
      urlOverrides: {
        newVariantUrl: editorUrl,
      },
    });
    await logPageView('instructorQuestionPreview', req, res);

    const questionContainerHtml = QuestionContainer({
      resLocals: res.locals,
      questionContext: 'instructor',
    });

    res.send(
      InstructorQuestionDraftEditor({
        resLocals: res.locals,
        question,
        questionFiles,
        allQuestionFiles,
        selectedFile,
        richTextEditorEnabled,
        questionContainerHtml: questionContainerHtml.toString(),
        editorUrl,
      }),
    );
  }),
);

router.post(
  '/editor',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const question = res.locals.question;

    if (!question.draft) {
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
      return;
    }

    assertCanEditDraft(res.locals);

    if (req.body.__action === 'rename_draft_question') {
      if (req.accepts('html')) {
        throw new error.HttpStatusError(406, 'Not Acceptable');
      }

      const qid =
        typeof req.body.qid === 'string' && req.body.qid.trim() !== ''
          ? req.body.qid
          : question.qid;
      const title =
        typeof req.body.title === 'string' && req.body.title.trim() !== ''
          ? req.body.title
          : question.title;

      const validation = validateShortName(qid);
      if (!validation.valid) {
        throw new error.HttpStatusError(400, `Invalid QID: ${validation.lowercaseMessage}`);
      }

      const client = getCourseFilesClient();
      const result = await client.renameQuestion.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        question_id: question.id,
        qid,
        title,
      });

      if (result.status === 'error') {
        throw new Error('Renaming question failed.');
      }

      const updatedQuestion = await selectQuestionById(question.id);
      res.json({ qid: updatedQuestion.qid, title: updatedQuestion.title });
    } else if (req.body.__action === 'submit_manual_revision') {
      await saveDraftQuestionFiles({
        course: res.locals.course,
        question,
        userId: res.locals.user.id,
        authnUserId: res.locals.authn_user.id,
        hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
        urlPrefix: res.locals.urlPrefix,
        html: b64DecodeUnicode(req.body.html),
        python: b64DecodeUnicode(req.body.python),
      });

      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/draft/editor`);
    } else if (req.body.__action === 'submit_file_revision') {
      const filePath = normalizeQuestionFilePath(req.body.filePath);
      await saveDraftQuestionFile({
        course: res.locals.course,
        question,
        userId: res.locals.user.id,
        authnUserId: res.locals.authn_user.id,
        hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
        urlPrefix: res.locals.urlPrefix,
        filePath,
        contents: b64DecodeUnicode(req.body.contents),
      });

      res.redirect(
        getEditorUrlWithSelectedFile({
          editorUrl: `${res.locals.urlPrefix}/question/${question.id}/draft/editor`,
          filePath,
        }),
      );
    } else if (req.body.__action === 'grade' || req.body.__action === 'save') {
      const variantId = await processSubmission(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/question/${question.id}/draft/editor?variant_id=${variantId}`,
      );
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant',
  typedAsyncHandler<'instructor-question', ResLocalsQuestionRender>(async (req, res) => {
    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;

    await getAndRenderVariant(variant_id, null, res.locals, {
      urlOverrides: {
        newVariantUrl: `${res.locals.urlPrefix}/question/${res.locals.question.id}/draft/editor`,
      },
    });
    await logPageView('instructorQuestionPreview', req, res);

    const questionContainerHtml = QuestionContainer({
      resLocals: res.locals,
      questionContext: 'instructor',
    });

    res.json({
      questionContainerHtml: questionContainerHtml.toString(),
      extraHeadersHtml: res.locals.extraHeadersHtml,
    });
  }),
);

router.post(
  '/variant',
  typedAsyncHandler<'instructor-question', ResLocalsQuestionRender>(async (req, res) => {
    if (req.body.__action === 'grade' || req.body.__action === 'save') {
      const variantId = await processSubmission(req, res);

      await getAndRenderVariant(variantId, null, res.locals, {
        urlOverrides: {
          newVariantUrl: `${res.locals.urlPrefix}/question/${res.locals.question.id}/draft/editor`,
        },
      });

      const questionContainerHtml = QuestionContainer({
        resLocals: res.locals,
        questionContext: 'instructor',
      });

      res.json({
        questionContainerHtml: questionContainerHtml.toString(),
        extraHeadersHtml: res.locals.extraHeadersHtml,
      });
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/files',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const courseFilesClient = getCourseFilesClient();
    const { files } = await courseFilesClient.getQuestionFiles.query({
      course_id: res.locals.course.id,
      question_id: res.locals.question.id,
    });
    const allFiles = await listQuestionFiles({
      course: res.locals.course,
      question: res.locals.question,
    });
    const selectedFile = await readSelectedQuestionFile({
      course: res.locals.course,
      question: res.locals.question,
      filePath: getSelectedQuestionFilePath(req.query.file),
    });

    res.json({ files, allFiles, selectedFile });
  }),
);

router.post(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const question = res.locals.question;

    if (!question.draft) {
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
      return;
    }

    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const qid = typeof req.body.qid === 'string' ? req.body.qid.trim() : '';

    try {
      await finalizeDraftQuestion({
        course: res.locals.course,
        question,
        user: res.locals.user,
        authnUser: res.locals.authn_user,
        hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
        qid,
        title,
      });
    } catch (err) {
      if (err instanceof DraftFinalizationInputError) {
        throw new error.HttpStatusError(400, err.message);
      }
      if (err instanceof DraftFinalizationEditorJobError) {
        throw new HttpRedirect(`${res.locals.urlPrefix}/edit_error/${err.jobSequenceId}`);
      }
      throw err;
    }

    flash('success', `Your question is ready for use as ${qid}.`);
    res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
  }),
);

export default router;
