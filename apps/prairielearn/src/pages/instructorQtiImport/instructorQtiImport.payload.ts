import type { inferRouterInputs } from '@trpc/server';

import type { CourseRouter } from '../../trpc/course/trpc.js';

import {
  type AssessmentOverrides,
  type QuestionOverrides,
  type SerializedConversionResult,
  type SerializedQuestionOutput,
  resolveRenamedDir,
} from './instructorQtiImport.types.js';

export type QtiImportCreateInput = inferRouterInputs<CourseRouter>['qtiImport']['create'];

type AssessmentConversionResult = Extract<SerializedConversionResult, { sourceType: 'assessment' }>;

interface IncludedResult {
  result: SerializedConversionResult;
  override: AssessmentOverrides;
}

export function getIncludedQuestionCount(
  result: SerializedConversionResult,
  questionOverrides: Map<string, QuestionOverrides>,
): number {
  return result.questions.filter((q) => questionOverrides.get(q.directoryName)?.included !== false)
    .length;
}

/**
 * Builds the `qtiImport.create` mutation input from the reviewed conversion results.
 *
 * Assessments can only be created inside a course instance. Without one, every included
 * result (quizzes included) is flattened into standalone question payloads instead.
 */
export function buildImportPayload({
  results,
  overrides,
  questionOverrides,
  existingDirs,
  courseInstanceId,
}: {
  results: SerializedConversionResult[];
  overrides: AssessmentOverrides[];
  questionOverrides: Map<string, QuestionOverrides>;
  /** Question directories that already exist in the course. */
  existingDirs: Set<string>;
  courseInstanceId: string | null;
}): QtiImportCreateInput {
  const canImportAssessments = courseInstanceId != null;
  const isQuestionIncluded = (directoryName: string) =>
    questionOverrides.get(directoryName)?.included !== false;

  const includedResults: IncludedResult[] = results
    .map((result, i) => ({ result, override: overrides[i] }))
    .filter(
      ({ result, override }) =>
        override.included && getIncludedQuestionCount(result, questionOverrides) > 0,
    );
  const includedAssessments = canImportAssessments
    ? includedResults.filter(
        (entry): entry is IncludedResult & { result: AssessmentConversionResult } =>
          entry.result.sourceType === 'assessment',
      )
    : [];
  const standaloneQuestionResults = canImportAssessments
    ? includedResults.filter(({ result }) => result.sourceType === 'question-bank')
    : includedResults;

  // Deduplicate assessment directory names so two assessments with the
  // same title don't overwrite each other.
  const allocatedAssessmentDirs = new Set<string>();
  const resolvedAssessmentDirNames = new Map<string, string>();
  for (const { result } of includedAssessments) {
    let dirName = result.assessment.directoryName;
    if (allocatedAssessmentDirs.has(dirName)) {
      let n = 2;
      while (allocatedAssessmentDirs.has(`${dirName}-${n}`)) n++;
      dirName = `${dirName}-${n}`;
    }
    allocatedAssessmentDirs.add(dirName);
    resolvedAssessmentDirNames.set(result.assessment.directoryName, dirName);
  }

  // Pre-compute final directory names for all renamed questions so that
  // the same question shared across multiple assessments gets a single
  // consistent name rather than re-resolving per assessment.
  const allocatedDirs = new Set(existingDirs);
  const resolvedDirNames = new Map<string, string>();
  for (const { result } of includedResults) {
    for (const q of result.questions) {
      if (resolvedDirNames.has(q.directoryName)) continue;
      const qOverride = questionOverrides.get(q.directoryName);
      if (qOverride?.included === false) continue;
      let dirName = q.directoryName;
      if (qOverride?.collides && qOverride.collisionStrategy === 'rename') {
        dirName = resolveRenamedDir(qOverride.originalDirName, allocatedDirs);
      }
      allocatedDirs.add(dirName);
      resolvedDirNames.set(q.directoryName, dirName);
    }
  }

  const toQuestionPayload = (q: SerializedQuestionOutput) => {
    const qOverride = questionOverrides.get(q.directoryName);
    return {
      draftId: q.draftId,
      originalDirectoryName: q.originalDirectoryName,
      directoryName: resolvedDirNames.get(q.directoryName) ?? q.directoryName,
      infoJson: {
        ...q.infoJson,
        ...(qOverride && {
          title: qOverride.title,
          topic: qOverride.topic,
          tags: qOverride.tags,
        }),
      },
      overwrite: qOverride?.collides && qOverride.collisionStrategy === 'overwrite',
    };
  };

  const questionPayloads = standaloneQuestionResults.flatMap(({ result }) =>
    result.questions.filter((q) => isQuestionIncluded(q.directoryName)).map(toQuestionPayload),
  );
  const questionPayloadsByDirectoryName = new Map(
    questionPayloads.map((question) => [question.directoryName, question]),
  );

  return {
    courseInstanceId,
    questions: [...questionPayloadsByDirectoryName.values()],
    assessments: includedAssessments.map(({ result, override }) => {
      const questions = result.questions
        .filter((q) => isQuestionIncluded(q.directoryName))
        .map(toQuestionPayload);
      const includedQuestionDirs = new Set(questions.map((q) => q.directoryName));

      // Rewrite assessment zones to reference the final directory names
      // and filter out excluded questions.
      const zones = result.assessment.infoJson.zones
        .map((zone) => ({
          ...zone,
          questions: zone.questions
            .map((zq) => {
              const id = resolvedDirNames.get(zq.id) ?? zq.id;
              return includedQuestionDirs.has(id) ? { ...zq, id } : null;
            })
            .filter((zq): zq is NonNullable<typeof zq> => zq !== null),
        }))
        .filter((zone) => zone.questions.length > 0);

      return {
        directoryName:
          resolvedAssessmentDirNames.get(result.assessment.directoryName) ??
          result.assessment.directoryName,
        infoJson: {
          ...result.assessment.infoJson,
          title: override.title,
          type: override.type,
          set: override.set,
          number: override.number,
          zones,
        },
        questions,
      };
    }),
  };
}
