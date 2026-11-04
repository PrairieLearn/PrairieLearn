import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { execa } from 'execa';

import type { Course } from '../lib/db-types.js';
import { isDraftQid } from '../lib/draft-question.js';
import { renameQidInAssessment } from '../lib/infoAssessment-edits.js';
import { validateShortName } from '../lib/short-name.js';
import { selectAssessmentsReferencingQuestions } from '../models/assessment.js';
import { selectQuestionByQid } from '../models/question.js';
import type { AssessmentJsonInput } from '../schemas/infoAssessment.js';
import { QuestionJsonSchema } from '../schemas/infoQuestion.js';

import { loadInfoFile } from './course-db.js';
import { selectSharedQuestions } from './sharing.js';

export interface QuestionRenameScope {
  kind: 'rename';
  qid: string;
  newQid: string;
  relativeFilePath: string;
  assessmentPaths: string[];
}

export async function getQuestionRenameScope(
  course: Course,
  qid: string,
  newQid: string,
): Promise<QuestionRenameScope | null> {
  if (isDraftQid(qid) || isDraftQid(newQid)) return null;
  if (!validateShortName(newQid).valid) return null;
  if ((await selectSharedQuestions(course.id)).some((question) => question.qid === qid)) {
    return null;
  }
  const question = await selectQuestionByQid({ course_id: course.id, qid });
  if (question.share_source_publicly) return null;
  const assessments = await selectAssessmentsReferencingQuestions({
    course_id: course.id,
    question_ids: [question.id],
  });
  return {
    kind: 'rename',
    qid,
    newQid,
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

/** Only a directory move, an optional title edit, and exact reference rewrites are eligible. */
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
  if (
    [...changes].some(([file, status]) => {
      if (file.startsWith(oldRoot)) return status !== 'D';
      return !file.startsWith(newRoot) && !scope.assessmentPaths.includes(file);
    })
  ) {
    return null;
  }

  // Compare blob identities, rather than reading every file in the moved directory.
  const oldTree = await git(['ls-tree', '-r', '-z', `${oldHash}:${oldRoot.slice(0, -1)}`]);
  const newTree = await git(['ls-tree', '-r', '-z', `${newHash}:${newRoot.slice(0, -1)}`]);
  const oldEntries = oldTree.split('\0').filter(Boolean);
  if (
    oldEntries.some((entry) => {
      const oldPath = `${oldRoot}${entry.slice(entry.indexOf('\t') + 1)}`;
      return changes.get(oldPath) !== 'D';
    })
  ) {
    return null;
  }
  const withoutInfo = (tree: string) =>
    tree
      .split('\0')
      .filter((entry) => entry && entry.slice(entry.indexOf('\t') + 1) !== 'info.json');
  if (!isDeepStrictEqual(withoutInfo(oldTree), withoutInfo(newTree))) return null;
  const loaded = await loadInfoFile<Record<string, unknown>>({
    coursePath,
    filePath: `${newRoot}info.json`,
  });
  if (!loaded?.data || loaded.errors.length > 0) return null;
  const parsed = QuestionJsonSchema.safeParse(loaded.data);
  if (!parsed.success) return null;
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
  const previousJson = previousPaths.map(() => {
    const headerEnd = previousBuffer.indexOf(10, offset);
    const length = Number(previousBuffer.subarray(offset, headerEnd).toString());
    offset = headerEnd + 1;
    const json = JSON.parse(previousBuffer.subarray(offset, offset + length).toString());
    offset += length + 1;
    return json;
  });
  const oldMetadata = { ...previousJson[0] };
  delete oldMetadata.title;
  const newMetadata = { ...loaded.data };
  delete newMetadata.title;
  if (!isDeepStrictEqual(oldMetadata, newMetadata)) return null;

  const assessmentsValid = await Promise.all(
    scope.assessmentPaths.map(async (file, index) => {
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
