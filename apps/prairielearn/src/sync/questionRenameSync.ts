import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { execa } from 'execa';

import type { Course } from '../lib/db-types.js';
import { isDraftQid } from '../lib/draft-question.js';
import { renameQidInAssessment } from '../lib/infoAssessment-edits.js';
import { selectAssessmentsReferencingQuestions } from '../models/assessment.js';
import { selectOptionalQuestionByQid } from '../models/question.js';
import { type AssessmentJsonInput, AssessmentJsonSchema } from '../schemas/infoAssessment.js';
import { QuestionJsonSchema } from '../schemas/infoQuestion.js';

import { loadInfoFile } from './course-db.js';
import { isQuestionQidEligibleForSync } from './questionSyncEligibility.js';
import { selectSharedQuestions } from './sharing.js';

export interface QuestionRenameScope {
  kind: 'rename';
  qid: string;
  newQid: string;
  uuid: string;
  relativeFilePath: string;
  assessmentPaths: string[];
}

export async function getQuestionRenameScope(
  course: Course,
  qid: string,
  newQid: string,
): Promise<QuestionRenameScope | null> {
  if (isDraftQid(qid) || !isQuestionQidEligibleForSync(newQid)) return null;
  if ((await selectSharedQuestions(course.id)).some((question) => question.qid === qid)) {
    return null;
  }
  const question = await selectOptionalQuestionByQid({ course_id: course.id, qid });
  if (!question || question.sync_errors || question.share_source_publicly || !question.uuid) {
    return null;
  }
  const assessments = await selectAssessmentsReferencingQuestions({
    course_id: course.id,
    question_ids: [question.id],
  });
  return {
    kind: 'rename',
    qid,
    newQid,
    uuid: question.uuid,
    relativeFilePath: path.join('questions', qid, 'info.json'),
    assessmentPaths: assessments.map((assessment) =>
      path.join(
        'courseInstances',
        assessment.course_instance_short_name,
        'assessments',
        assessment.assessment_directory,
        'infoAssessment.json',
      ),
    ),
  };
}

/** Verifies identity, file layout, and exact assessment rewrites; content may change. */
export async function verifyQuestionRename({
  coursePath,
  oldHash,
  newHash,
  scope,
}: {
  coursePath: string;
  oldHash: string;
  newHash: string;
  scope: QuestionRenameScope;
}): Promise<(QuestionRenameScope & { oldQid: string; title: string }) | null> {
  const git = async (args: string[]) => (await execa('git', args, { cwd: coursePath })).stdout;
  const oldRoot = `questions/${scope.qid}/`;
  const newRoot = `questions/${scope.newQid}/`;
  const changedFiles = (
    await git([
      'diff',
      '--relative',
      '--no-renames',
      '--name-status',
      '-z',
      oldHash,
      newHash,
      '--',
      '.',
    ])
  )
    .split('\0')
    .filter(Boolean);
  const changes = new Map<string, string>();
  for (let index = 0; index < changedFiles.length; index += 2) {
    changes.set(changedFiles[index + 1], changedFiles[index]);
  }
  // Keep the same file layout, but allow content edits alongside the move.
  const oldTree = await git([
    'ls-tree',
    '--full-tree',
    '-r',
    '-z',
    `${oldHash}:./${oldRoot.slice(0, -1)}`,
  ]);
  const newTree = await git([
    'ls-tree',
    '--full-tree',
    '-r',
    '-z',
    `${newHash}:./${newRoot.slice(0, -1)}`,
  ]);
  const oldEntries = oldTree.split('\0').filter(Boolean);
  if (
    oldEntries.some((entry) => {
      const oldPath = `${oldRoot}${entry.slice(entry.indexOf('\t') + 1)}`;
      return changes.get(oldPath) !== 'D';
    })
  ) {
    return null;
  }
  const fileLayout = (tree: string) =>
    tree
      .split('\0')
      .filter(Boolean)
      .map(
        (entry) => `${entry.slice(0, entry.indexOf(' '))}\t${entry.slice(entry.indexOf('\t') + 1)}`,
      );
  if (!isDeepStrictEqual(fileLayout(oldTree), fileLayout(newTree))) return null;
  if (
    newTree
      .split('\0')
      .filter(Boolean)
      .some((entry) => changes.get(`${newRoot}${entry.slice(entry.indexOf('\t') + 1)}`) !== 'A')
  ) {
    return null;
  }
  const loaded = await loadInfoFile<Record<string, unknown>>({
    coursePath,
    filePath: `${newRoot}info.json`,
  });
  if (!loaded?.data || loaded.errors.length > 0) return null;
  const parsed = QuestionJsonSchema.safeParse(loaded.data);
  if (!parsed.success || parsed.data.uuid.toLowerCase() !== scope.uuid.toLowerCase()) return null;
  const previousPaths = [`${oldRoot}info.json`, ...scope.assessmentPaths];
  const { stdout: previousFiles } = await execa(
    'git',
    ['cat-file', '--batch=%(objectsize)', '-z'],
    {
      cwd: coursePath,
      input: previousPaths.map((file) => `${oldHash}:./${file}\0`).join(''),
      encoding: 'buffer',
      stripFinalNewline: false,
    },
  );
  const previousBuffer = Buffer.from(previousFiles);
  let offset = 0;
  let previousJson: unknown[];
  try {
    previousJson = previousPaths.map(() => {
      const headerEnd = previousBuffer.indexOf(10, offset);
      const length = Number(previousBuffer.subarray(offset, headerEnd).toString());
      offset = headerEnd + 1;
      const json = JSON.parse(previousBuffer.subarray(offset, offset + length).toString());
      offset += length + 1;
      return json;
    });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // A previous sync can have recorded JSON errors; full sync must handle the repair.
    return null;
  }
  if (!QuestionJsonSchema.safeParse(previousJson[0]).success) return null;
  const oldMetadata = { ...(previousJson[0] as Record<string, unknown>) };
  delete oldMetadata.title;
  const newMetadata = { ...loaded.data };
  delete newMetadata.title;
  if (!isDeepStrictEqual(oldMetadata, newMetadata)) return null;

  const assessmentsValid = await Promise.all(
    scope.assessmentPaths.map(async (file, index) => {
      if (!AssessmentJsonSchema.safeParse(previousJson[index + 1]).success) return false;
      const before = previousJson[index + 1] as AssessmentJsonInput;
      const after = await loadInfoFile<Record<string, unknown>>({ coursePath, filePath: file });
      if (!after?.data || after.errors.length > 0) return false;
      const expected = renameQidInAssessment(before, scope.qid, scope.newQid);
      return expected.renamedCount > 0 && isDeepStrictEqual(expected.assessment, after.data);
    }),
  );
  if (assessmentsValid.some((valid) => !valid)) return null;
  return { ...scope, oldQid: scope.qid, qid: scope.newQid, title: parsed.data.title };
}
