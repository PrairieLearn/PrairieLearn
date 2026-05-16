import * as path from 'node:path';

import * as error from '@prairielearn/error';

import { createDirectoryBrowserHtml } from '../../../components/FileBrowser.js';
import { b64EncodeUnicode } from '../../../lib/base64-util.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import type { Course, Question, User } from '../../../lib/db-types.js';
import { getPaths } from '../../../lib/instructorFiles.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

import {
  getEditorUrlWithSelectedDirectory,
  getEditorUrlWithSelectedFile,
  getSelectedQuestionDirectory,
  getSelectedQuestionFilePath,
  readSelectedQuestionFile,
} from './selectedQuestionFile.js';

export const DRAFT_INFO_JSON_DISABLED_REASON =
  'Draft question metadata is managed by the draft editor. Only finalized questions can edit info.json directly.';

type InstructorQuestionLocals = ResLocalsForPage<'instructor-question'>;

function encodeCourseFilePath(filePath: string) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

export function isDraftQuestionInfoFile(filePath: string) {
  return path.posix.normalize(filePath) === 'info.json';
}

async function renderAllQuestionFilesHtml({
  resLocals,
  editorUrl,
  selectedDirectory,
}: {
  resLocals: InstructorQuestionLocals;
  editorUrl: string;
  selectedDirectory: string | null;
}) {
  if (!resLocals.question.qid) return '';

  const questionRootPath = `questions/${resLocals.question.qid}`;
  const requestedPath =
    selectedDirectory == null
      ? questionRootPath
      : path.posix.join(questionRootPath, selectedDirectory);
  const paths = getPaths(requestedPath, {
    ...resLocals,
    navPage: 'question',
  });
  const fileViewBaseUrl = `${resLocals.urlPrefix}/question/${resLocals.question.id}/file_view`;
  const successfulActionRedirectUrl = getEditorUrlWithSelectedDirectory({
    editorUrl,
    directory: selectedDirectory,
  });
  const getDirectoryRelativeToQuestion = (directoryPath: string) => {
    const relativePath = path.posix.relative(
      questionRootPath,
      directoryPath.split(path.sep).join('/'),
    );
    return relativePath === '' ? null : relativePath;
  };
  const getFileRelativeToQuestion = (filePath: string) =>
    path.posix.relative(questionRootPath, filePath.split(path.sep).join('/'));
  const getSelectedFileAttributes = (filePath: string) => ({
    'data-selected-file-path': getFileRelativeToQuestion(filePath),
  });
  const getDraftInfoJsonDisabledReason = (filePath: string) =>
    isDraftQuestionInfoFile(getFileRelativeToQuestion(filePath))
      ? DRAFT_INFO_JSON_DISABLED_REASON
      : null;

  return (
    await createDirectoryBrowserHtml({
      paths,
      isReadOnly: false,
      csrfToken: resLocals.__csrf_token,
      options: {
        fileViewBaseUrl,
        formAction: `${fileViewBaseUrl}/${encodeCourseFilePath(questionRootPath)}`,
        successfulActionRedirectUrl,
        directoryUrl: (directoryPath) =>
          getEditorUrlWithSelectedDirectory({
            editorUrl,
            directory: getDirectoryRelativeToQuestion(directoryPath),
          }),
        directoryAttributes: (directoryPath) => ({
          'data-selected-directory-path': getDirectoryRelativeToQuestion(directoryPath) ?? '',
        }),
        fileViewUrl: (file) =>
          getEditorUrlWithSelectedFile({
            editorUrl,
            filePath: getFileRelativeToQuestion(file.path),
          }),
        fileViewAttributes: (file) => getSelectedFileAttributes(file.path),
        fileViewDisabledReason: (file) => getDraftInfoJsonDisabledReason(file.path),
        editFileUrl: (file) =>
          getEditorUrlWithSelectedFile({
            editorUrl,
            filePath: getFileRelativeToQuestion(file.path),
          }),
        editFileAttributes: (file) => getSelectedFileAttributes(file.path),
        editFileDisabledReason: (file) => getDraftInfoJsonDisabledReason(file.path),
      },
    })
  ).toString();
}

export async function getQuestionFilesData({
  resLocals,
  editorUrl,
  selectedFile,
  selectedDirectory,
}: {
  resLocals: InstructorQuestionLocals;
  editorUrl: string;
  selectedFile: unknown;
  selectedDirectory: unknown;
}) {
  const courseFilesClient = getCourseFilesClient();
  const directory = getSelectedQuestionDirectory(selectedDirectory);
  const selectedFilePath = getSelectedQuestionFilePath(selectedFile);
  const [{ files }, allFilesHtml, selectedQuestionFile] = await Promise.all([
    courseFilesClient.getQuestionFiles.query({
      course_id: resLocals.course.id,
      question_id: resLocals.question.id,
    }),
    renderAllQuestionFilesHtml({ resLocals, editorUrl, selectedDirectory: directory }),
    readSelectedQuestionFile({
      course: resLocals.course,
      question: resLocals.question,
      filePath:
        selectedFilePath == null || isDraftQuestionInfoFile(selectedFilePath)
          ? null
          : selectedFilePath,
    }),
  ]);

  return { files, allFilesHtml, selectedFile: selectedQuestionFile };
}

export async function saveDraftQuestionFile({
  course,
  question,
  user,
  authn_user,
  authz_data,
  urlPrefix,
  filePath,
  contents,
}: {
  course: Course;
  question: Question;
  user: User;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  urlPrefix: string;
  filePath: string;
  contents: string;
}) {
  if (isDraftQuestionInfoFile(filePath)) {
    throw new error.HttpStatusError(400, DRAFT_INFO_JSON_DISABLED_REASON);
  }

  const client = getCourseFilesClient();

  const result = await client.updateQuestionFiles.mutate({
    course_id: course.id,
    user_id: user.id,
    authn_user_id: authn_user.id,
    question_id: question.id,
    has_course_permission_edit: authz_data.has_course_permission_edit,
    files: {
      [filePath]: b64EncodeUnicode(contents),
    },
  });

  if (result.status === 'error') {
    return {
      status: 'error' as const,
      editErrorUrl: urlPrefix + '/edit_error/' + result.job_sequence_id,
    };
  }

  return { status: 'ok' as const };
}
