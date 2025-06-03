import * as shlex from 'shlex';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import { type QuestionJson } from '../../schemas/index.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';
import { isDraftQid } from '../question.js';

function getParamsForQuestion(qid: string, q: QuestionJson | null | undefined) {
  if (!q) return null;

  let partialCredit;
  if (q.partialCredit != null) {
    partialCredit = q.partialCredit;
  } else {
    if (q.type === 'v3') {
      partialCredit = true;
    } else {
      partialCredit = false;
    }
  }
  let external_grading_entrypoint = q.externalGradingOptions?.entrypoint;
  if (Array.isArray(external_grading_entrypoint)) {
    external_grading_entrypoint = shlex.join(external_grading_entrypoint);
  }
  let workspace_args = q.workspaceOptions?.args;
  if (Array.isArray(workspace_args)) {
    workspace_args = shlex.join(workspace_args);
  }
  return {
    type: q.type === 'v3' ? 'Freeform' : q.type,
    title: q.title,
    partial_credit: partialCredit,
    template_directory: q.template,
    options: q.options,
    client_files: q.clientFiles || [],
    draft: isDraftQid(qid),
    topic: q.topic,
    grading_method: q.gradingMethod || 'Internal',
    single_variant: !!q.singleVariant,
    show_correct_answer: q.showCorrectAnswer === undefined ? true : q.showCorrectAnswer,
    comment: q.comment,
    external_grading_enabled: q.externalGradingOptions?.enabled,
    external_grading_image: q.externalGradingOptions?.image,
    external_grading_files: q.externalGradingOptions?.serverFilesCourse ?? [],
    external_grading_entrypoint,
    external_grading_timeout: q.externalGradingOptions?.timeout,
    external_grading_enable_networking: q.externalGradingOptions?.enableNetworking ?? false,
    external_grading_environment: q.externalGradingOptions?.environment ?? {},
    external_grading_comment: q.externalGradingOptions?.comment,
    dependencies: q.dependencies ?? {},
    workspace_image: q.workspaceOptions?.image,
    workspace_port: q.workspaceOptions?.port,
    workspace_args,
    workspace_home: q.workspaceOptions?.home,
    workspace_graded_files: q.workspaceOptions?.gradedFiles ?? [],
    workspace_url_rewrite: q.workspaceOptions?.rewriteUrl ?? true,
    workspace_enable_networking: q.workspaceOptions?.enableNetworking ?? false,
    workspace_environment: q.workspaceOptions?.environment ?? {},
    workspace_comment: q.workspaceOptions?.comment,
    share_publicly: q.sharePublicly ?? false,
    share_source_publicly: q.shareSourcePublicly ?? false,
  };
}

export async function sync(
  courseId: string,
  courseData: CourseData,
): Promise<Record<string, string>> {
  const questionParams = Object.entries(courseData.questions).map(([qid, question]) => {
    return JSON.stringify([
      qid,
      question.uuid,
      infofile.stringifyErrors(question),
      infofile.stringifyWarnings(question),
      getParamsForQuestion(qid, question.data),
    ]);
  });

  const result = await sqldb.callRow(
    'sync_questions',
    [questionParams, courseId],
    z.record(z.string(), IdSchema),
  );

  return result;
}
