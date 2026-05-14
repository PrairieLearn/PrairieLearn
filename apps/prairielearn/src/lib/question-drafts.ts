import path from 'node:path';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import type { Course, Question, User } from './db-types.js';
import { discoverInfoDirs } from './discover-info-dirs.js';
import { QuestionRenameEditor, validateQidNesting } from './editors.js';
import { idsEqual } from './id.js';
import { validateShortName } from './short-name.js';

const sql = loadSqlEquiv(import.meta.url);

export class DraftFinalizationInputError extends Error {}

export class DraftFinalizationEditorJobError extends Error {
  constructor(public readonly jobSequenceId: string) {
    super('Failed to finalize the draft question.');
  }
}

export async function finalizeDraftQuestion({
  course,
  question,
  user,
  authnUser,
  hasCoursePermissionEdit,
  qid,
  title,
}: {
  course: Course;
  question: Question;
  user: User;
  authnUser: User;
  hasCoursePermissionEdit: boolean;
  qid: string;
  title: string;
}) {
  const finalQid = qid.trim();
  const finalTitle = title.trim();

  if (!idsEqual(question.course_id, course.id) || question.deleted_at != null || !question.draft) {
    throw new DraftFinalizationInputError(
      'Question must be an active draft question in this course.',
    );
  }

  if (question.sync_errors) {
    throw new DraftFinalizationInputError(
      'Draft question sync errors must be resolved before finalization.',
    );
  }

  if (finalTitle === '') {
    throw new DraftFinalizationInputError('Title is required.');
  }

  const validation = validateShortName(finalQid);
  if (!validation.valid) {
    throw new DraftFinalizationInputError(`Invalid QID: ${validation.lowercaseMessage}.`);
  }

  if (finalQid === '__drafts__' || finalQid.startsWith('__drafts__/')) {
    throw new DraftFinalizationInputError(
      'Finalized question QIDs cannot be in the draft namespace.',
    );
  }

  const existingQids = await discoverInfoDirs(path.join(course.path, 'questions'), 'info.json');
  if (existingQids.includes(finalQid)) {
    throw new DraftFinalizationInputError(`A question with QID "${finalQid}" already exists.`);
  }

  try {
    validateQidNesting(finalQid, existingQids, question.qid ?? undefined);
  } catch (err) {
    throw new DraftFinalizationInputError(err instanceof Error ? err.message : 'Invalid QID.');
  }

  const editor = new QuestionRenameEditor({
    locals: {
      authz_data: {
        has_course_permission_edit: hasCoursePermissionEdit,
        authn_user: authnUser,
      },
      course,
      user,
      question,
    },
    qid_new: finalQid,
    title_new: finalTitle,
  });

  const serverJob = await editor.prepareServerJob();

  try {
    await editor.executeWithServerJob(serverJob);
  } catch {
    throw new DraftFinalizationEditorJobError(serverJob.jobSequenceId);
  }

  await execute(sql.delete_draft_question_metadata, { question_id: question.id });

  return {
    questionId: question.id,
    qid: finalQid,
  };
}
