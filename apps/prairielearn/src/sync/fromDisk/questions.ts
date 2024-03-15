import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';

import * as infofile from '../infofile';
import { makePerformance } from '../performance';
import { CourseData, Question } from '../course-db';
import { IdSchema } from '../../lib/db-types';

const perf = makePerformance('questions');

function getParamsForQuestion(q: Question | null | undefined) {
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
  return {
    type: q.type === 'v3' ? 'Freeform' : q.type,
    title: q.title,
    partial_credit: partialCredit,
    template_directory: q.template,
    options: q.options,
    client_files: q.clientFiles || [],
    topic: q.topic,
    grading_method: q.gradingMethod || 'Internal',
    single_variant: !!q.singleVariant,
    show_correct_answer: q.showCorrectAnswer === undefined ? true : q.showCorrectAnswer,
    external_grading_enabled: q.externalGradingOptions && q.externalGradingOptions.enabled,
    external_grading_image: q.externalGradingOptions && q.externalGradingOptions.image,
    external_grading_files: q.externalGradingOptions && q.externalGradingOptions.serverFilesCourse,
    external_grading_entrypoint: q.externalGradingOptions && q.externalGradingOptions.entrypoint,
    external_grading_timeout: q.externalGradingOptions && q.externalGradingOptions.timeout,
    external_grading_enable_networking:
      q.externalGradingOptions && q.externalGradingOptions.enableNetworking,
    external_grading_environment: q.externalGradingOptions?.environment ?? {},
    dependencies: q.dependencies || {},
    workspace_image: q.workspaceOptions && q.workspaceOptions.image,
    workspace_port: q.workspaceOptions && q.workspaceOptions.port,
    workspace_args: q.workspaceOptions && q.workspaceOptions.args,
    workspace_home: q.workspaceOptions && q.workspaceOptions.home,
    workspace_graded_files: q.workspaceOptions && q.workspaceOptions.gradedFiles,
    workspace_url_rewrite: q.workspaceOptions && q.workspaceOptions.rewriteUrl,
    workspace_enable_networking: q.workspaceOptions && q.workspaceOptions.enableNetworking,
    workspace_environment: q.workspaceOptions?.environment ?? {},
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
      getParamsForQuestion(question.data),
    ]);
  });

  perf.start('sproc:sync_questions');
  const result = await sqldb.callRow(
    'sync_questions',
    [questionParams, courseId],
    z.record(z.string(), IdSchema),
  );
  perf.end('sproc:sync_questions');

  return result;
}
