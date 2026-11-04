import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { execa } from 'execa';
import fs from 'fs-extra';
import { z } from 'zod';

import { contains } from '@prairielearn/path-utils';
import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { type Course, QuestionSchema } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { selectInstitutionForCourse } from '../models/institution.js';
import { selectQuestionByQid, syncQuestionTitle, syncQuestionTopic } from '../models/question.js';
import { selectSharingSetsForQuestion } from '../models/sharing-set.js';
import { selectTagNamesForOtherQuestions, selectTagsByQuestionId } from '../models/tags.js';
import { selectTopicNamesForOtherQuestions, selectTopicsByCourseId } from '../models/topics.js';
import { type CourseJson, CourseJsonSchema } from '../schemas/infoCourse.js';
import { type QuestionJson, QuestionJsonSchema } from '../schemas/infoQuestion.js';

import { getDefaultTagsInUse, loadInfoFile, loadQuestionInfo } from './course-db.js';
import { deduplicateByName } from './deduplicate.js';
import * as questions from './fromDisk/questions.js';
import { syncQuestionTags } from './fromDisk/tags.js';
import { syncTopics } from './fromDisk/topics.js';
import { type InfoFile } from './infofile.js';
import { type QuestionRenameScope, verifyQuestionRename } from './questionRenameSync.js';

const sql = loadSqlEquiv(import.meta.url);

interface QuestionCatalogSync {
  tagsChanged: boolean;
  topicChanged: boolean;
  courseMetadata: Pick<CourseJson, 'tags' | 'topics'>;
}

export type QuestionSyncChange =
  | (QuestionRenameScope & { oldQid: string; title: string })
  | { kind: 'content'; qid: string }
  | { kind: 'title'; qid: string; title: string }
  | {
      kind: 'recover';
      qid: string;
      info: InfoFile<QuestionJson>;
      catalogs: QuestionCatalogSync | null;
    }
  | {
      kind: 'metadata';
      qid: string;
      metadata: { title: string; tags: string[]; topic: string };
      tagsChanged: boolean;
      topicChanged: boolean;
      courseMetadata: Pick<CourseJson, 'tags' | 'topics'>;
    };

/** Requires the course lock and final checkout. Returns null when changes require full sync. */
export async function getQuestionSyncPlan({
  course,
  oldHash,
  newHash,
  editedPaths = [],
  renameScope,
}: {
  course: Course;
  oldHash: string | null;
  newHash: string;
  editedPaths?: string[];
  renameScope?: QuestionRenameScope | null;
}): Promise<QuestionSyncChange[] | null> {
  if (!oldHash) return null;
  const institution = await selectInstitutionForCourse({ course_id: course.id });
  if (
    !(await features.enabled('partial-course-sync', {
      course_id: course.id,
      institution_id: institution.id,
    }))
  ) {
    return null;
  }
  const diff = await execa(
    'git',
    ['diff', '--relative', '--no-renames', '--name-status', '-z', oldHash, newHash, '--', '.'],
    { cwd: course.path, reject: false },
  );
  if (diff.exitCode !== 0) return null;

  const files = new Set<string>();
  const changes = diff.stdout.split('\0').filter(Boolean);
  for (let index = 0; index < changes.length; index += 2) {
    if (!['M', 'A', 'D'].includes(changes[index])) return null;
    files.add(changes[index + 1]);
  }
  // A reverted edit can have an empty net diff but still need reconciliation.
  for (const file of editedPaths) {
    if (!contains(course.path, file)) return null;
    files.add(path.relative(course.path, file));
  }
  if (files.size === 0) return [];

  // Git mode 120000 identifies symlinks, which can redirect content edits into metadata.
  const { stdout: trackedFiles } = await execa('git', ['ls-files', '--stage', '-z', '--', '.'], {
    cwd: course.path,
  });
  if (trackedFiles.split('\0').some((entry) => entry.startsWith('120000 '))) return null;
  if (
    renameScope &&
    files.has(`questions/${renameScope.qid}/info.json`) &&
    files.has(`questions/${renameScope.newQid}/info.json`)
  ) {
    const renamed = await verifyQuestionRename({
      coursePath: course.path,
      oldHash,
      newHash,
      scope: renameScope,
    });
    return renamed ? [renamed] : null;
  }
  if ([...files].some((file) => !file.startsWith('questions/'))) return null;

  const rows = await queryRows(
    sql.select_questions_for_files,
    { course_id: course.id, file_paths: [...files] },
    z.object({ file_path: z.string(), question: QuestionSchema.nullable() }),
  );
  const plan = new Map<string, QuestionSyncChange>();
  const realCoursePath = await fs.realpath(course.path);
  for (const { file_path: file, question } of rows) {
    if (!question?.qid) return null;
    const absolutePath = path.join(course.path, file);
    if (!contains(course.path, absolutePath)) return null;
    if (await fs.pathExists(absolutePath)) {
      if ((await fs.realpath(absolutePath)) !== path.join(realCoursePath, file)) return null;
      if (!(await fs.lstat(absolutePath)).isFile()) return null;
    }
    if (file === `questions/${question.qid}/info.json`) {
      const original = await execa('git', ['show', `${oldHash}:./${file}`], {
        cwd: course.path,
        reject: false,
      });
      if (original.exitCode !== 0) return null;
      let previous: unknown;
      try {
        previous = JSON.parse(original.stdout);
      } catch {
        return null;
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(previous);
      if (!parsed.success) return null;
      if (question.sync_errors) {
        const info = await loadQuestionInfo(course.id, course.path, question.qid);
        if (!info || !question.uuid || info.uuid?.toLowerCase() !== question.uuid.toLowerCase()) {
          return null;
        }
        // Even unapplied preferences in the failed file can leave errors on assessments.
        // Use full sync until those assessments can be revalidated selectively.
        if (
          question.preferences_schema != null ||
          info.data?.preferences != null ||
          parsed.data.preferences != null
        ) {
          return null;
        }
        if (info.data) {
          const sharingSets = await selectSharingSetsForQuestion({
            course_id: course.id,
            question_id: question.id,
          });
          // Validation errors must not bypass the pre-push sharing checks.
          if (
            info.data.sharePublicly !== question.share_publicly ||
            info.data.shareSourcePublicly !== question.share_source_publicly ||
            info.data.sharingSets?.length ||
            sharingSets.some((set) => set.in_set)
          ) {
            return null;
          }
        }
        let catalogs: QuestionCatalogSync | null = null;
        if (info.data && info.errors.length === 0) {
          const [tags, topics] = await Promise.all([
            selectTagsByQuestionId(question.id),
            selectTopicsByCourseId(course.id),
          ]);
          const tagsChanged = !isDeepStrictEqual(
            new Set(tags.map((tag) => tag.name)),
            new Set(info.data.tags),
          );
          const topicChanged =
            topics.find((topic) => topic.id === question.topic_id)?.name !== info.data.topic;
          if (tagsChanged || topicChanged) {
            const courseInfo = await loadInfoFile({
              coursePath: course.path,
              filePath: 'infoCourse.json',
            });
            if (!courseInfo?.data || courseInfo.errors.length > 0) return null;
            const courseMetadata = CourseJsonSchema.safeParse(courseInfo.data);
            if (!courseMetadata.success) return null;
            catalogs = { tagsChanged, topicChanged, courseMetadata: courseMetadata.data };
          }
        }
        plan.set(question.qid, { kind: 'recover', qid: question.qid, info, catalogs });
        continue;
      }
      const loaded = await loadInfoFile<Record<string, unknown>>({
        coursePath: course.path,
        filePath: file,
      });
      if (!loaded?.data || loaded.errors.length > 0) return null;
      const validated = QuestionJsonSchema.safeParse(loaded.data);
      if (!validated.success) return null;
      const {
        title: _oldTitle,
        tags: oldTags,
        topic: oldTopic,
        ...oldRemainingFields
      } = parsed.data;
      const {
        title: _newTitle,
        tags: newTags,
        topic: newTopic,
        ...newRemainingFields
      } = loaded.data;
      if (!isDeepStrictEqual(oldRemainingFields, newRemainingFields)) return null;
      const tagsChanged = !isDeepStrictEqual(oldTags, newTags);
      const topicChanged = oldTopic !== newTopic;
      if (!tagsChanged && !topicChanged) {
        plan.set(question.qid, { kind: 'title', qid: question.qid, title: validated.data.title });
      } else {
        const courseInfo = await loadInfoFile({
          coursePath: course.path,
          filePath: 'infoCourse.json',
        });
        if (!courseInfo?.data || courseInfo.errors.length > 0) return null;
        const courseMetadata = CourseJsonSchema.safeParse(courseInfo.data);
        if (!courseMetadata.success) return null;
        plan.set(question.qid, {
          kind: 'metadata',
          qid: question.qid,
          metadata: {
            title: validated.data.title,
            tags: validated.data.tags,
            topic: validated.data.topic,
          },
          tagsChanged,
          topicChanged,
          courseMetadata: courseMetadata.data,
        });
      }
    } else if (!plan.has(question.qid)) {
      plan.set(question.qid, { kind: 'content', qid: question.qid });
    }
  }
  return [...plan.values()];
}

/** Requires the course lock; metadata and chunk activation share the caller transaction. */
export async function syncQuestionMetadata(
  course: Course,
  change: Extract<QuestionSyncChange, { kind: 'metadata' }>,
) {
  await runInTransactionAsync(async () => {
    const question = await selectQuestionByQid({ course_id: course.id, qid: change.qid });
    await syncQuestionCatalogs(course, question.id, change.metadata, change);
    if (change.topicChanged) {
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

async function syncQuestionCatalogs(
  course: Course,
  questionId: string,
  metadata: Pick<QuestionJson, 'tags' | 'topic'>,
  catalogs: QuestionCatalogSync,
) {
  if (catalogs.tagsChanged) {
    const knownNames = new Set(
      await selectTagNamesForOtherQuestions({ course_id: course.id, question_id: questionId }),
    );
    metadata.tags.forEach((name) => knownNames.add(name));
    const courseTags = deduplicateByName(
      catalogs.courseMetadata.tags ?? [],
      getDefaultTagsInUse(knownNames),
    ).entries;
    await syncQuestionTags({
      courseId: course.id,
      courseTags,
      questionTags: [{ questionId, tags: metadata.tags }],
      knownNames,
      isInfoCourseValid: true,
      deleteUnused: true,
    });
  }
  if (catalogs.topicChanged) {
    const knownNames = new Set(
      await selectTopicNamesForOtherQuestions({ course_id: course.id, question_id: questionId }),
    );
    knownNames.add(metadata.topic);
    await syncTopics({
      courseId: course.id,
      courseTopics: deduplicateByName(catalogs.courseMetadata.topics).entries,
      knownNames,
      isInfoCourseValid: true,
      deleteUnused: true,
    });
  }
}

/** Requires the course lock; recovery shares the chunk activation transaction. */
export async function syncRecoveredQuestion(
  course: Course,
  change: Extract<QuestionSyncChange, { kind: 'recover' }>,
) {
  await runInTransactionAsync(async () => {
    if (change.catalogs && change.info.data) {
      const question = await selectQuestionByQid({ course_id: course.id, qid: change.qid });
      await syncQuestionCatalogs(course, question.id, change.info.data, change.catalogs);
    }
    await questions.sync(course.id, { questions: { [change.qid]: change.info } }, 'metadata');
  });
}
