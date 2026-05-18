import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { b64DecodeUnicode } from '../lib/base64-util.js';
import type { Course, Question, User } from '../lib/db-types.js';
import {
  getQuestionFilesData,
  getSelectedQuestionDirectory,
  getSelectedQuestionFilePath,
  normalizeQuestionFilePath,
  saveDraftQuestionFile,
} from '../lib/draft-question-files.js';
import { idsEqual } from '../lib/id.js';
import { selectOptionalQuestionById } from '../models/question.js';

export interface AiDraftFilesError {
  List: never;
  Save: never;
}

export const ListInputSchema = z.object({
  questionId: IdSchema,
  selectedFilePath: z.string().nullable(),
  selectedDirectory: z.string().nullable(),
});

export const SaveInputSchema = z.object({
  questionId: IdSchema,
  filePath: z.string(),
  encodedContents: z.string(),
});

interface DraftQuestionFilesLocals {
  __csrf_token: string;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  course: Course;
  question: Question;
  urlPrefix: string;
  user: User;
}

async function selectDraftQuestionOrThrow({
  courseId,
  questionId,
}: {
  courseId: string;
  questionId: string;
}) {
  const question = await selectOptionalQuestionById(questionId);
  if (
    question == null ||
    !idsEqual(question.course_id, courseId) ||
    question.deleted_at != null ||
    !question.draft
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Draft question not found',
    });
  }
  return question;
}

function throwTrpcError(err: unknown): never {
  if (err instanceof error.HttpStatusError) {
    throw new TRPCError({
      code: err.status === 404 ? 'NOT_FOUND' : err.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
      message: err.message,
    });
  }
  throw err;
}

export async function listDraftQuestionFiles({
  courseId,
  locals,
  input,
}: {
  courseId: string;
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
  input: z.infer<typeof ListInputSchema>;
}) {
  const question = await selectDraftQuestionOrThrow({
    courseId,
    questionId: input.questionId,
  });

  try {
    return await getQuestionFilesData({
      resLocals: {
        ...locals,
        question,
      },
      editorUrl: `${locals.urlPrefix}/ai_generate_editor/${question.id}`,
      selectedFilePath: getSelectedQuestionFilePath(input.selectedFilePath),
      selectedDirectory: getSelectedQuestionDirectory(input.selectedDirectory),
    });
  } catch (err) {
    throwTrpcError(err);
  }
}

export async function saveDraftQuestion({
  courseId,
  locals,
  authzData,
  input,
}: {
  courseId: string;
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
  authzData: DraftQuestionFilesLocals['authz_data'];
  input: z.infer<typeof SaveInputSchema>;
}) {
  const question = await selectDraftQuestionOrThrow({
    courseId,
    questionId: input.questionId,
  });

  try {
    return await saveDraftQuestionFile({
      course: locals.course,
      question,
      user: locals.user,
      authn_user: locals.authn_user,
      authz_data: authzData,
      urlPrefix: locals.urlPrefix,
      filePath: normalizeQuestionFilePath(input.filePath),
      contents: b64DecodeUnicode(input.encodedContents),
    });
  } catch (err) {
    throwTrpcError(err);
  }
}
