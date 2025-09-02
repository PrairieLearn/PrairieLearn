import * as shlex from 'shlex';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../lib/db-types.js';
import {
  type QuestionJson,
  defaultExternalGradingOptions,
  defaultWorkspaceOptions,
} from '../../schemas/index.js';
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

  const workspaceOptions = q.workspaceOptions ?? defaultWorkspaceOptions;
  const externalGradingOptions = q.externalGradingOptions ?? defaultExternalGradingOptions;
  let external_grading_entrypoint = externalGradingOptions.entrypoint;
  if (Array.isArray(external_grading_entrypoint)) {
    external_grading_entrypoint = shlex.join(external_grading_entrypoint);
  }
  let workspace_args = workspaceOptions.args;
  if (Array.isArray(workspace_args)) {
    workspace_args = shlex.join(workspace_args);
  }
  return {
    type: q.type === 'v3' ? 'Freeform' : q.type,
    title: q.title,
    partial_credit: partialCredit,
    template_directory: q.template,
    options: q.options,
    client_files: q.clientFiles,
    draft: isDraftQid(qid),
    topic: q.topic,
    grading_method: q.gradingMethod,
    single_variant: q.singleVariant,
    show_correct_answer: q.showCorrectAnswer,
    comment: q.comment,
    external_grading_enabled: externalGradingOptions.enabled,
    external_grading_image: externalGradingOptions.image,
    external_grading_files: externalGradingOptions.serverFilesCourse,
    external_grading_entrypoint,
    external_grading_timeout: externalGradingOptions.timeout,
    external_grading_enable_networking: externalGradingOptions.enableNetworking,
    external_grading_environment: externalGradingOptions.environment,
    external_grading_comment: externalGradingOptions.comment,
    dependencies: q.dependencies,
    workspace_image: workspaceOptions.image,
    workspace_port: workspaceOptions.port,
    workspace_args,
    workspace_home: workspaceOptions.home,
    workspace_graded_files: workspaceOptions.gradedFiles,
    workspace_url_rewrite: workspaceOptions.rewriteUrl,
    workspace_enable_networking: workspaceOptions.enableNetworking,
    workspace_environment: workspaceOptions.environment,
    workspace_comment: workspaceOptions.comment,
    share_publicly: q.sharePublicly,
    share_source_publicly: q.shareSourcePublicly,
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
