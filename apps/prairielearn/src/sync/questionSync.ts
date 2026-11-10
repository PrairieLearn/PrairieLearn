import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { execa } from 'execa';
import fs from 'fs-extra';
import { z } from 'zod';

import { contains } from '@prairielearn/path-utils';
import {
  loadSqlEquiv,
  queryOptionalRow,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { type Course, QuestionSchema } from '../lib/db-types.js';
import { selectQuestionByQid, syncQuestionTitle, syncQuestionTopic } from '../models/question.js';
import { selectTagNamesForOtherQuestions } from '../models/tags.js';
import { selectTopicNamesForOtherQuestions } from '../models/topics.js';
import { type CourseJson, CourseJsonSchema } from '../schemas/infoCourse.js';
import { type QuestionJson, QuestionJsonSchema } from '../schemas/infoQuestion.js';

import { getDefaultTagsInUse, loadInfoFile, loadNewQuestionInfo } from './course-db.js';
import { deduplicateByName } from './deduplicate.js';
import * as authors from './fromDisk/authors.js';
import * as questions from './fromDisk/questions.js';
import { syncQuestionTags } from './fromDisk/tags.js';
import { syncTopics } from './fromDisk/topics.js';
import { type QuestionRenameScope, verifyQuestionRename } from './questionRenameSync.js';
import { isQuestionQidEligibleForSync } from './questionSyncEligibility.js';
import { CURRENT_SYNC_VERSION } from './version.js';

const sql = loadSqlEquiv(import.meta.url);

interface QuestionFileSyncScope {
  kind: 'content' | 'metadata';
  qid: string;
  relativeFilePath: string;
}

interface NewQuestionScope {
  kind: 'create';
  qid: string;
  uuid: string;
  courseId: string;
}

export type QuestionSyncScope = QuestionFileSyncScope | QuestionRenameScope | NewQuestionScope;

export type QuestionSyncChange =
  | (NewQuestionScope & {
      question: QuestionJson;
      courseMetadata: Pick<CourseJson, 'tags' | 'topics'>;
    })
  | (QuestionRenameScope & { oldQid: string; title: string })
  | (Omit<QuestionFileSyncScope, 'kind'> &
      (
        | { kind: 'content' }
        | { kind: 'title'; title: string }
        | {
            kind: 'metadata';
            metadata: { title: string; tags: string[]; topic: string };
            tagsChanged: boolean;
            topicChanged: boolean;
            courseMetadata: Pick<CourseJson, 'tags' | 'topics'>;
          }
      ));

export function hasQuestionSyncBaseline(course: Course, currentHash: string): boolean {
  const previous = course.last_successful_sync;
  return (
    previous?.commitHash === currentHash &&
    previous.commitHash === course.commit_hash &&
    previous.version === CURRENT_SYNC_VERSION &&
    previous.chunksGenerated === config.chunksGenerator
  );
}

/** Requires the course lock and the baseline loaded before its database invalidation. */
export async function getQuestionSyncScope(
  course: Course,
  filePath: string,
  currentHash: string,
): Promise<QuestionFileSyncScope | null> {
  if (!hasQuestionSyncBaseline(course, currentHash)) return null;

  const relativeFilePath = path.relative(course.path, filePath);
  const parts = relativeFilePath.split(path.sep);
  if (parts[0] !== 'questions' || !contains(course.path, filePath)) return null;

  const qids = parts.slice(1, -1).map((_, index) => parts.slice(1, index + 2).join('/'));
  const question = await queryOptionalRow(
    sql.select_question_for_file,
    { course_id: course.id, qids },
    QuestionSchema,
  );
  if (!question?.qid) return null;

  const kind =
    relativeFilePath === path.join('questions', question.qid, 'info.json') ? 'metadata' : 'content';

  // Symlinked content could alias a metadata file despite a content-looking path.
  const realCoursePath = await fs.realpath(course.path);
  const realFilePath = await fs.realpath(filePath);
  if (realFilePath !== path.join(realCoursePath, relativeFilePath)) return null;
  if (!(await fs.lstat(filePath)).isFile()) return null;

  return { kind, qid: question.qid, relativeFilePath };
}

/** Verify that checkout resets, hooks, or other changes did not widen the operation. */
export async function getVerifiedQuestionChange({
  coursePath,
  oldHash,
  newHash,
  scope,
}: {
  coursePath: string;
  oldHash: string;
  newHash: string;
  scope: QuestionSyncScope;
}): Promise<QuestionSyncChange | null> {
  if (oldHash === newHash) return null;
  // Git mode 120000 identifies a symlink. A metadata symlink elsewhere in the
  // course could read the edited content file, widening the scope of the edit.
  const { stdout: trackedFiles } = await execa('git', ['ls-files', '--stage', '-z', '--', '.'], {
    cwd: coursePath,
  });
  if (trackedFiles.split('\0').some((entry) => entry.startsWith('120000 '))) return null;
  if (scope.kind === 'rename') {
    return await verifyQuestionRename({ coursePath, oldHash, newHash, scope });
  }
  const { stdout } = await execa(
    'git',
    ['diff', '--relative', '--no-renames', '--name-status', '-z', oldHash, newHash, '--', '.'],
    { cwd: coursePath },
  );
  const changes = stdout.split('\0');
  if (scope.kind === 'create') return await verifyNewQuestion(coursePath, scope, changes);
  if (changes.length !== 3 || changes[0] !== 'M' || changes[1] !== scope.relativeFilePath) {
    return null;
  }
  if (scope.kind === 'content') return { ...scope, kind: 'content' };

  const loaded = await loadInfoFile<Record<string, unknown>>({
    coursePath,
    filePath: scope.relativeFilePath,
  });
  if (!loaded?.data || loaded.errors.length > 0) return null;
  const metadata = QuestionJsonSchema.pick({ title: true, tags: true, topic: true })
    .strip()
    .safeParse(loaded.data);
  if (!metadata.success) return null;

  const { stdout: original } = await execa(
    'git',
    ['show', `${oldHash}:./${scope.relativeFilePath}`],
    { cwd: coursePath },
  );
  // The baseline guarantees that unchanged metadata has already passed full sync.
  const {
    title: oldTitle,
    tags: oldTags,
    topic: oldTopic,
    ...oldMetadata
  } = JSON.parse(original) as Record<string, unknown>;
  const { title: newTitle, tags: newTags, topic: newTopic, ...newMetadata } = loaded.data;
  if (!isDeepStrictEqual(oldMetadata, newMetadata)) return null;
  const tagsChanged = !isDeepStrictEqual(oldTags, newTags);
  const topicChanged = oldTopic !== newTopic;
  if (!tagsChanged && !topicChanged) {
    return oldTitle === newTitle ? null : { ...scope, kind: 'title', title: metadata.data.title };
  }
  const courseInfo = await loadInfoFile({ coursePath, filePath: 'infoCourse.json' });
  if (!courseInfo?.data || courseInfo.errors.length > 0) return null;
  const courseMetadata = CourseJsonSchema.safeParse(courseInfo.data);
  if (!courseMetadata.success) return null;
  return {
    ...scope,
    kind: 'metadata',
    metadata: metadata.data,
    tagsChanged,
    topicChanged,
    courseMetadata: courseMetadata.data,
  };
}

/** Requires a verified baseline and the course lock; disk and chunk publication are owned by the editor. */
export async function syncQuestionMetadata(
  course: Course,
  change: Extract<QuestionSyncChange, { kind: 'metadata' }>,
) {
  await runInTransactionAsync(async () => {
    const question = await selectQuestionByQid({ course_id: course.id, qid: change.qid });
    if (change.tagsChanged) {
      const knownNames = new Set(
        await selectTagNamesForOtherQuestions({ course_id: course.id, question_id: question.id }),
      );
      change.metadata.tags.forEach((name) => knownNames.add(name));
      const courseTags = deduplicateByName(
        change.courseMetadata.tags ?? [],
        getDefaultTagsInUse(knownNames),
      ).entries;
      await syncQuestionTags({
        courseId: course.id,
        courseTags,
        questionTags: [{ questionId: question.id, tags: change.metadata.tags }],
        knownNames,
        isInfoCourseValid: true,
        deleteUnused: true,
      });
    }
    if (change.topicChanged) {
      const knownNames = new Set(
        await selectTopicNamesForOtherQuestions({ course_id: course.id, question_id: question.id }),
      );
      knownNames.add(change.metadata.topic);
      await syncTopics({
        courseId: course.id,
        courseTopics: deduplicateByName(change.courseMetadata.topics).entries,
        knownNames,
        isInfoCourseValid: true,
        deleteUnused: true,
      });
      await syncQuestionTopic({
        course_id: course.id,
        qid: change.qid,
        topic: change.metadata.topic,
      });
    }
    if (question.title !== change.metadata.title) {
      await syncQuestionTitle({
        course_id: course.id,
        qid: change.qid,
        title: change.metadata.title,
      });
    }
  });
}

async function verifyNewQuestion(
  coursePath: string,
  scope: NewQuestionScope,
  changes: string[],
): Promise<QuestionSyncChange | null> {
  if (!isQuestionQidEligibleForSync(scope.qid)) return null;
  const prefix = `questions/${scope.qid}/`;
  let addedInfo = false;
  for (let i = 0; i < changes.length - 1; i += 2) {
    if (changes[i] !== 'A' || !changes[i + 1].startsWith(prefix)) return null;
    if (changes[i + 1] === `${prefix}info.json`) addedInfo = true;
  }
  if (!addedInfo) return null;
  const info = await loadNewQuestionInfo(coursePath, scope.qid);
  const question = info?.data;
  if (
    !question ||
    info.errors.length > 0 ||
    info.warnings.length > 0 ||
    question.uuid !== scope.uuid ||
    question.sharePublicly ||
    question.shareSourcePublicly ||
    question.sharingSets?.length
  ) {
    return null;
  }
  if (
    await queryScalar(
      sql.question_identity_exists,
      {
        course_id: scope.courseId,
        uuid: scope.uuid,
        qid: scope.qid,
      },
      z.boolean(),
    )
  ) {
    return null;
  }
  const courseInfo = await loadInfoFile({ coursePath, filePath: 'infoCourse.json' });
  const courseMetadata = CourseJsonSchema.safeParse(courseInfo?.data);
  if (!courseMetadata.success) return null;
  return { ...scope, question, courseMetadata: courseMetadata.data };
}

export async function syncNewQuestion(
  course: Course,
  change: Extract<QuestionSyncChange, { kind: 'create' }>,
) {
  await runInTransactionAsync(async () => {
    const questionInfos = {
      [change.qid]: { uuid: change.uuid, data: change.question, errors: [], warnings: [] },
    };
    const ids = await questions.sync(course.id, { questions: questionInfos }, true);
    await authors.sync(questionInfos, ids);
    await syncQuestionMetadata(course, {
      kind: 'metadata',
      qid: change.qid,
      relativeFilePath: `questions/${change.qid}/info.json`,
      metadata: change.question,
      tagsChanged: change.question.tags.length > 0,
      topicChanged: true,
      courseMetadata: change.courseMetadata,
    });
  });
}
