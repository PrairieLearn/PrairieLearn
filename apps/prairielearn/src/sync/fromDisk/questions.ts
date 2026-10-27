import * as shlex from 'shlex';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { isDraftQid } from '../../lib/draft-question.js';
import { normalizeQuestionAuthors } from '../../lib/question-authors.js';
import { type QuestionJson, defaultWorkspaceOptions } from '../../schemas/index.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

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
  let external_grading_entrypoint = q.externalGradingOptions?.entrypoint;
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
    authors: normalizeQuestionAuthors(q.authors).uids,
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
    external_grading_image: q.externalGradingOptions?.image,
    external_grading_files: q.externalGradingOptions?.serverFilesCourse ?? [],
    external_grading_entrypoint,
    external_grading_timeout: q.externalGradingOptions?.timeout,
    external_grading_enable_networking: q.externalGradingOptions?.enableNetworking ?? false,
    external_grading_environment: q.externalGradingOptions?.environment ?? {},
    external_grading_comment: q.externalGradingOptions?.comment,
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
    preferences_schema: q.preferences,
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

  const result = await sqldb.callScalar(
    'sync_questions',
    [questionParams, courseId],
    z.record(z.string(), IdSchema),
  );

  await syncQuestionCopyProvenance(courseId, courseData, result);
  return result;
}

async function syncQuestionCopyProvenance(
  courseId: string,
  courseData: CourseData,
  questionIds: Record<string, string>,
): Promise<void> {
  const validQuestions = Object.entries(courseData.questions).flatMap(([qid, question]) => {
    if (!question.data || infofile.hasErrors(question)) return [];
    return [{ qid, copiedFrom: question.data.copiedFrom ?? null }];
  });
  if (validQuestions.length === 0) return;

  const references = validQuestions.flatMap(({ qid, copiedFrom }) => {
    if (!copiedFrom) return [];
    const [course_uuid, question_uuid] = copiedFrom.split('/', 2);
    return [{ qid, course_uuid, question_uuid }];
  });
  const sources =
    references.length > 0
      ? await sqldb.queryRows(
          sql.select_copied_from_questions,
          { source_references: JSON.stringify(references) },
          z.object({ qid: z.string(), copied_from_question_id: IdSchema.nullable() }),
        )
      : [];
  const sourceIds = new Map(sources.map((source) => [source.qid, source.copied_from_question_id]));

  const provenance = validQuestions.map(({ qid, copiedFrom }) => ({
    question_id: questionIds[qid],
    copied_from: copiedFrom,
    copied_from_question_id: sourceIds.get(qid) ?? null,
  }));
  await sqldb.execute(sql.update_copied_from, {
    course_id: courseId,
    provenance: JSON.stringify(provenance),
  });
}
