/* eslint-disable @typescript-eslint/dot-notation */
import { randomUUID } from 'node:crypto';
import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { QuestionSchema, QuestionTagSchema, TagSchema, TopicSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import {
  type QuestionJsonInput,
  type TagJsonInput,
  type TopicJsonInput,
} from '../../schemas/index.js';
import * as helperDb from '../helperDb.js';
import { withConfig } from '../utils/config.js';

import * as util from './util.js';

/**
 * Makes an empty question.
 */
function makeQuestion(courseData: util.CourseData): QuestionJsonInput {
  return {
    uuid: randomUUID(),
    title: 'Test question',
    type: 'v3',
    topic: courseData.course.topics[0].name,
  };
}

async function findSyncedQuestion(qid) {
  const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
  const syncedQuestion = syncedQuestions.find((q) => q.qid === qid);
  assert.isDefined(syncedQuestion);
  return syncedQuestion;
}

async function findSyncedUndeletedQuestion(qid) {
  const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
  const syncedQuestion = syncedQuestions.find((q) => q.qid === qid && q.deleted_at == null);
  assert.isDefined(syncedQuestion);
  return syncedQuestion;
}

describe('Question syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it('allows nesting of questions in subfolders', async () => {
    const courseData = util.getCourseData();
    const nestedQuestionStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'nestedQuestion'];
    const questionId = nestedQuestionStructure.join('/');
    courseData.questions[questionId] = makeQuestion(courseData);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === questionId);
    assert.isOk(syncedQuestion);
  });

  it('soft-deletes and restores questions', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const oldSyncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const oldSyncedQuestion = oldSyncedQuestions.find((q) => q.qid === util.QUESTION_ID);

    const oldQuestion = courseData.questions[util.QUESTION_ID];
    delete courseData.questions[util.QUESTION_ID];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const midSyncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const midSyncedQuestion = midSyncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.isOk(midSyncedQuestion);
    assert.isNotNull(midSyncedQuestion.deleted_at);

    courseData.questions[util.QUESTION_ID] = oldQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const newSyncedQuestion = newSyncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.deepEqual(newSyncedQuestion, oldSyncedQuestion);
  });

  it('handles tags that are not present in infoCourse.json', async () => {
    // Missing tags should be created
    const courseData = util.getCourseData();
    const missingTagName = 'missing tag name';
    courseData.questions[util.QUESTION_ID].tags?.push(missingTagName);
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    let syncedTags = await util.dumpTableWithSchema('tags', TagSchema);
    let syncedTag = syncedTags.find((tag) => tag.name === missingTagName);
    assert.isOk(syncedTag);
    assert.isTrue(syncedTag.implicit);
    assert.isNotEmpty(syncedTag.description, 'tag should not have empty description');

    // Subsequent syncs with the same data should succeed as well
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTags = await util.dumpTableWithSchema('tags', TagSchema);
    syncedTag = syncedTags.find((tag) => tag.name === missingTagName);
    assert.isOk(syncedTag);
    assert.isTrue(syncedTag.implicit);

    // When missing tags are no longer used in any questions, they should
    // be removed from the DB
    courseData.questions[util.QUESTION_ID].tags?.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTags = await util.dumpTableWithSchema('tags', TagSchema);
    syncedTag = syncedTags.find((tag) => tag.name === missingTagName);
    assert.isUndefined(syncedTag);
  });

  it('handles topics that are not present in infoCourse.json', async () => {
    // Missing topics should be created
    const courseData = util.getCourseData();
    const missingTopicName = 'missing topic name';
    const originalTopicName = courseData.questions[util.QUESTION_ID].topic;
    courseData.questions[util.QUESTION_ID].topic = missingTopicName;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    let syncedTopics = await util.dumpTableWithSchema('topics', TopicSchema);
    let syncedTopic = syncedTopics.find((topic) => topic.name === missingTopicName);
    assert.isOk(syncedTopic);
    assert.isTrue(syncedTopic.implicit);
    assert.isNotEmpty(syncedTopic.description, 'topic should not have empty description');

    // Subsequent syncs with the same data should succeed as well
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTopics = await util.dumpTableWithSchema('topics', TopicSchema);
    syncedTopic = syncedTopics.find((topic) => topic.name === missingTopicName);
    assert.isOk(syncedTopic);
    assert.isTrue(syncedTopic.implicit);

    // When missing topics are no longer used in any questions, they should
    // be removed from the DB
    courseData.questions[util.QUESTION_ID].topic = originalTopicName;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTopics = await util.dumpTableWithSchema('topics', TopicSchema);
    syncedTopic = syncedTopics.find((topic) => topic.name === missingTopicName);
    assert.isUndefined(syncedTopic);
  });

  it('syncs empty arrays correctly', async () => {
    // Note that we want the database to contain empty arrays, not NULL
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].clientFiles = [];
    courseData.questions[util.QUESTION_ID].externalGradingOptions = {
      image: 'docker-image',
      entrypoint: 'entrypoint',
      serverFilesCourse: [],
    };
    await util.writeAndSyncCourseData(courseData);
    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.isArray(syncedQuestion?.client_files, 'client_files should be an array');
    assert.isEmpty(syncedQuestion?.client_files, 'client_files should be empty');
    assert.isArray(
      syncedQuestion?.external_grading_files,
      'external_grading_files should be an array',
    );
    assert.isEmpty(
      syncedQuestion?.external_grading_files,
      'external_grading_files should be empty',
    );
  });

  it('syncs entrypoint as an array', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].externalGradingOptions = {
      image: 'docker-image',
      entrypoint: ['entrypoint', 'second argument'],
    };
    await util.writeAndSyncCourseData(courseData);
    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.equal(syncedQuestion?.external_grading_entrypoint, "entrypoint 'second argument'");
  });

  it('syncs workspace args as an array', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].workspaceOptions = {
      image: 'docker-image',
      port: 8080,
      home: '/home/user',
      args: ['first', 'second argument'],
    };
    await util.writeAndSyncCourseData(courseData);
    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.equal(syncedQuestion?.workspace_args, "first 'second argument'");
  });

  it('allows the same UUID to be used in different courses', async () => {
    // We'll just sync the same course from two different directories.
    // Since courses are identified by directory, this will create two
    // separate courses.
    const courseData = util.getCourseData();
    const firstDirectory = await util.writeCourseToTempDirectory(courseData);
    const secondDirectory = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(firstDirectory);
    await util.syncCourseData(secondDirectory);
    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const questions = syncedQuestions.filter((q) => q.qid === util.QUESTION_ID);
    assert.equal(questions.length, 2);
  });

  it('preserves question topic even if question topic is deleted', async () => {
    const courseData = util.getCourseData();
    const newTopic: TopicJsonInput = {
      name: 'test topic',
      color: 'green1',
      description: 'test topic description',
    };
    courseData.course.topics.push(newTopic);
    courseData.questions[util.QUESTION_ID].topic = newTopic.name;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const originalSyncedQuestion = await findSyncedQuestion(util.QUESTION_ID);

    // Now delete the topic, but leave the question in place.
    courseData.course.topics.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedQuestion = await findSyncedQuestion(util.QUESTION_ID);
    assert.equal(newSyncedQuestion.id, originalSyncedQuestion.id);

    // Check that we have a valid auto-created topic
    const syncedTopics = await util.dumpTableWithSchema('topics', TopicSchema);
    const syncedTopic = syncedTopics.find((t) => t.name === newTopic.name);
    assert.isDefined(syncedTopic);
    assert.equal(newSyncedQuestion.topic_id, syncedTopic.id);
    assert.isTrue(syncedTopic.implicit);
  });

  it('preserves question tag even if question tag is deleted', async () => {
    const courseData = util.getCourseData();
    const newTag: TagJsonInput = {
      name: 'test tag',
      color: 'green1',
      description: 'test tag description',
    };
    courseData.course.tags.push(newTag);
    courseData.questions[util.QUESTION_ID].tags?.push(newTag.name);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const originalSyncedQuestion = await findSyncedQuestion(util.QUESTION_ID);

    // Now delete the tag, but leave the question in place.
    courseData.course.tags.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedQuestion = await findSyncedQuestion(util.QUESTION_ID);
    assert.equal(newSyncedQuestion.id, originalSyncedQuestion.id);

    // Check that we have a valid auto-created tag
    const syncedTags = await util.dumpTableWithSchema('tags', TagSchema);
    const syncedTag = syncedTags.find((t) => t.name === newTag.name);
    assert.isDefined(syncedTag);
    const syncedQuestionTags = await util.dumpTableWithSchema('question_tags', QuestionTagSchema);
    const syncedQuestionTag = syncedQuestionTags.find(
      (qt) => idsEqual(qt.question_id, newSyncedQuestion.id) && idsEqual(qt.tag_id, syncedTag.id),
    );
    assert.isTrue(syncedTag.implicit);
    assert.ok(syncedQuestionTag);
  });

  it('records an error if "options" object is invalid', async () => {
    const courseData = util.getCourseData();
    const testQuestion = courseData.questions[util.QUESTION_ID];
    testQuestion.type = 'Checkbox';
    // Bad options - missing `incorrectAnswers`
    testQuestion.options = {
      text: 'is this a bad question?',
      correctAnswers: ['yes'],
    };
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.isDefined(syncedQuestion);
    assert.isNotNull(syncedQuestion.sync_errors);
    assert.match(syncedQuestion.sync_errors, /data must have required property 'incorrectAnswers'/);
  });

  it('records a warning if same UUID is used in multiple questions', async () => {
    const courseData = util.getCourseData();
    courseData.questions['test2'] = courseData.questions[util.QUESTION_ID];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const firstSyncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.isDefined(firstSyncedQuestion);
    assert.isNotNull(firstSyncedQuestion.sync_warnings);
    assert.match(
      firstSyncedQuestion.sync_warnings,
      /UUID "f4ff2429-926e-4358-9e1f-d2f377e2036a" is used in other questions: test2/,
    );
    const secondSyncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.isDefined(secondSyncedQuestion);
    assert.isNotNull(secondSyncedQuestion.sync_warnings);
    assert.match(
      secondSyncedQuestion.sync_warnings,
      new RegExp(
        `UUID "f4ff2429-926e-4358-9e1f-d2f377e2036a" is used in other questions: ${util.QUESTION_ID}`,
      ),
    );
  });

  it('records an error if a question directory is missing an info.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'questions', 'badQuestion'));
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === 'badQuestion');
    assert.isOk(syncedQuestion);
    assert.isNotNull(syncedQuestion.sync_errors);
    assert.match(
      syncedQuestion.sync_errors,
      /Missing JSON file: questions\/badQuestion\/info.json/,
    );
  });

  it('records an error if a nested question directory does not eventually contain an info.json file', async () => {
    const courseData = util.getCourseData();
    const nestedQuestionStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'nestedQuestion'];
    const questionId = nestedQuestionStructure.join('/');
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'questions', ...nestedQuestionStructure));
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === questionId);
    assert.isOk(syncedQuestion);
    assert.isNotNull(syncedQuestion.sync_errors);
    assert.match(
      syncedQuestion.sync_errors,
      /Missing JSON file: questions\/subfolder1\/subfolder2\/subfolder3\/nestedQuestion\/info.json/,
    );

    // We should only record an error for the most deeply nested directories,
    // not any of the intermediate ones.
    for (let i = 0; i < nestedQuestionStructure.length - 1; i++) {
      const partialNestedQuestionStructure = nestedQuestionStructure.slice(0, i);
      const partialQuestionId = partialNestedQuestionStructure.join('/');
      const syncedQuestion = syncedQuestions.find((q) => q.qid === partialQuestionId);
      assert.isUndefined(syncedQuestion);
    }
  });

  it('correctly handles a new question with the same QID as a deleted question', async () => {
    const courseData = util.getCourseData();
    const question = makeQuestion(courseData);
    courseData.questions['repeatedQuestion'] = question;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the question and re-sync
    question.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedQuestion = await findSyncedUndeletedQuestion('repeatedQuestion');
    assert.equal(syncedQuestion.uuid, question.uuid);
  });

  it('does not modify deleted questions', async () => {
    const courseData = util.getCourseData();
    const originalQuestion = makeQuestion(courseData);
    courseData.questions['repeatedQuestion'] = originalQuestion;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID and title of the question and re-sync
    const newQuestion = { ...originalQuestion };
    newQuestion.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    newQuestion.title = 'Changed title';
    courseData.questions['repeatedQuestion'] = newQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const deletedQuestion = syncedQuestions.find(
      (q) => q.qid === 'repeatedQuestion' && q.deleted_at != null,
    );
    assert.isDefined(deletedQuestion);
    assert.equal(deletedQuestion.uuid, originalQuestion.uuid);
    assert.equal(deletedQuestion.title, originalQuestion.title);
  });

  it('does not add errors to deleted questions', async () => {
    const courseData = util.getCourseData();
    const originalQuestion = makeQuestion(courseData);
    courseData.questions['repeatedQuestion'] = originalQuestion;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the question, add an error and re-sync
    const newQuestion = { ...originalQuestion };
    newQuestion.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    // @ts-expect-error -- intentionally breaking the question
    delete newQuestion.title;
    courseData.questions['repeatedQuestion'] = newQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // check that the newly-synced question has an error
    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find(
      (q) => q.qid === 'repeatedQuestion' && q.deleted_at == null,
    );
    assert.isDefined(syncedQuestion);
    assert.equal(syncedQuestion.uuid, newQuestion.uuid);
    assert.isNotNull(syncedQuestion.sync_errors);
    assert.match(syncedQuestion.sync_errors, /must have required property 'title'/);

    // check that the old deleted question does not have any errors
    const deletedQuestion = syncedQuestions.find(
      (q) => q.qid === 'repeatedQuestion' && q.deleted_at != null,
    );
    assert.isDefined(deletedQuestion);
    assert.equal(deletedQuestion.uuid, originalQuestion.uuid);
    assert.isNull(deletedQuestion.sync_errors);
  });

  // https://github.com/PrairieLearn/PrairieLearn/issues/6539
  it('handles unique sequence of renames and duplicate UUIDs', async () => {
    const courseData = util.getCourseData();

    // Start with a clean slate.
    courseData.questions = {};

    // Write and sync a single question.
    const originalQuestion = makeQuestion(courseData);
    originalQuestion.uuid = '0e8097aa-b554-4908-9eac-d46a78d6c249';
    courseData.questions['a'] = originalQuestion;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // Now "move" the above question to a new directory AND add another with the
    // same UUID.
    delete courseData.questions['a'];
    courseData.questions['b'] = originalQuestion;
    courseData.questions['c'] = originalQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // Now "fix" the duplicate UUID.
    courseData.questions['c'] = {
      ...originalQuestion,
      uuid: '0e3097ba-b554-4908-9eac-d46a78d6c249',
    };
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const questions = await util.dumpTableWithSchema('questions', QuestionSchema);

    // Original question should not exist.
    const originalQuestionRow = questions.find((q) => q.qid === 'a');
    assert.isUndefined(originalQuestionRow);

    // New questions should exist and have the correct UUIDs.
    const newQuestionRow1 = questions.find((q) => q.qid === 'b' && q.deleted_at === null);
    assert.isDefined(newQuestionRow1);
    assert.isNull(newQuestionRow1.deleted_at);
    assert.equal(newQuestionRow1.uuid, '0e8097aa-b554-4908-9eac-d46a78d6c249');
    const newQuestionRow2 = questions.find((q) => q.qid === 'c' && q.deleted_at === null);
    assert.isDefined(newQuestionRow2);
    assert.isNull(newQuestionRow2.deleted_at);
    assert.equal(newQuestionRow2.uuid, '0e3097ba-b554-4908-9eac-d46a78d6c249');
  });

  it('syncs draft questions', async () => {
    const courseData = util.getCourseData();
    const question = makeQuestion(courseData);
    question.title = 'Draft question';
    question.uuid = '0e8097aa-b554-4908-9eac-d46a78d6c249';
    courseData.questions['__drafts__/draft_1'] = question;
    await util.writeAndSyncCourseData(courseData);

    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === '__drafts__/draft_1');
    assert.isOk(syncedQuestion);
    assert.isTrue(syncedQuestion.draft);
  });

  it('syncs string comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].comment = 'Question comment';
    courseData.questions[util.QUESTION_ID].workspaceOptions = {
      image: 'docker-image',
      port: 8080,
      home: '/home/user',
      comment: 'Workspace comment',
    };
    courseData.questions[util.QUESTION_ID].externalGradingOptions = {
      image: 'docker-image',
      comment: 'External grading comment',
    };
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.equal(syncedQuestion?.json_comment, 'Question comment');
    assert.equal(syncedQuestion?.json_workspace_comment, 'Workspace comment');
    assert.equal(syncedQuestion?.json_external_grading_comment, 'External grading comment');
  });

  it('syncs array comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].comment = ['question comment 1', 'question comment 2'];
    courseData.questions[util.QUESTION_ID].workspaceOptions = {
      image: 'docker-image',
      port: 8080,
      home: '/home/user',
      comment: ['workspace comment 1', 'workspace comment 2'],
    };
    courseData.questions[util.QUESTION_ID].externalGradingOptions = {
      image: 'docker-image',
      comment: ['external grading comment 1', 'external grading comment 2'],
    };
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.deepEqual(syncedQuestion?.json_comment, ['question comment 1', 'question comment 2']);
    assert.deepEqual(syncedQuestion?.json_workspace_comment, [
      'workspace comment 1',
      'workspace comment 2',
    ]);
    assert.deepEqual(syncedQuestion?.json_external_grading_comment, [
      'external grading comment 1',
      'external grading comment 2',
    ]);
  });

  it('syncs object comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].comment = {
      comment: 'question comment 1',
      comment2: 'question comment 2',
    };
    courseData.questions[util.QUESTION_ID].workspaceOptions = {
      image: 'docker-image',
      port: 8080,
      home: '/home/user',
      comment: {
        comment: 'workspace comment 1',
        comment2: 'workspace comment 2',
      },
    };
    courseData.questions[util.QUESTION_ID].externalGradingOptions = {
      image: 'docker-image',
      comment: {
        comment: 'external grading comment 1',
        comment2: 'external grading comment 2',
      },
    };
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.deepEqual(syncedQuestion?.json_comment, {
      comment: 'question comment 1',
      comment2: 'question comment 2',
    });
    assert.deepEqual(syncedQuestion?.json_workspace_comment, {
      comment: 'workspace comment 1',
      comment2: 'workspace comment 2',
    });
    assert.deepEqual(syncedQuestion?.json_external_grading_comment, {
      comment: 'external grading comment 1',
      comment2: 'external grading comment 2',
    });
  });

  it('forbids sharing settings when sharing is not enabled', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].sharingSets = [];
    courseData.questions[util.QUESTION_ID].sharePublicly = true;
    courseData.questions[util.QUESTION_ID].shareSourcePublicly = true;

    await withConfig({ checkSharingOnSync: true }, async () => {
      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);
    });

    const syncedQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.isOk(syncedQuestion);
    assert.isNotNull(syncedQuestion.sync_errors);
    assert.match(syncedQuestion.sync_errors, /"sharingSets" cannot be used/);
    assert.match(syncedQuestion.sync_errors, /"sharePublicly" cannot be used/);
    assert.match(syncedQuestion.sync_errors, /"shareSourcePublicly" cannot be used/);
  });
});
