import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { CourseSchema, TagSchema, TopicSchema } from '../../lib/db-types.js';
import type { TagJsonInput, TopicJsonInput } from '../../schemas/infoCourse.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

/**
 * Topics and tags are currently almost identical, so we test them together
 * with a set of helper functions.
 */

/**
 * Makes a new tag/topic to test with.
 */
function makeEntity(): TagJsonInput | TopicJsonInput {
  return {
    name: 'a new entity',
    color: 'green1',
    description: 'description for a new entity',
  };
}

/**
 * Checks that the entity present in the database matches the data
 * from the original entity in `infoCourse.json`.
 *
 * @param syncedEntity - The entity from the database.
 * @param entity - The entity from `infoCourse.json`.
 */
function checkEntity(syncedEntity: any, entity: any) {
  assert.isOk(syncedEntity);
  assert.equal(syncedEntity.name, entity.name);
  assert.equal(syncedEntity.color, entity.color);
  assert.equal(syncedEntity.description, entity.description);
}

function checkEntityOrder(entityName, syncedEntities, courseData) {
  courseData.course[entityName].forEach((entity, index) => {
    assert.equal(syncedEntities.find((e) => e.name === entity.name).number, index + 1);
  });
}

async function testAdd(entityName: 'tags' | 'topics') {
  const { courseData, courseDir } = await util.createAndSyncCourseData();
  const newEntity = makeEntity();
  courseData.course[entityName].push(newEntity);
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const schema = entityName === 'tags' ? TagSchema : TopicSchema;
  const syncedEntities = await util.dumpTableWithSchema(entityName, schema);
  const syncedEntity = syncedEntities.find((e) => e.name === newEntity.name);
  checkEntity(syncedEntity, newEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testAddMissingDescription(entityName: 'tags' | 'topics') {
  const { courseData, courseDir } = await util.createAndSyncCourseData();
  const newEntity = makeEntity();
  delete newEntity.description;
  courseData.course[entityName].push(newEntity);
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const schema = entityName === 'tags' ? TagSchema : TopicSchema;
  const syncedEntities = await util.dumpTableWithSchema(entityName, schema);
  const syncedEntity = syncedEntities.find((e) => e.name === newEntity.name);
  checkEntity(syncedEntity, { ...newEntity, description: '' });
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testRemove(entityName: 'tags' | 'topics') {
  const courseData = util.getCourseData();
  const oldEntity = makeEntity();
  courseData.course[entityName].unshift(oldEntity);
  const { courseDir } = await util.writeAndSyncCourseData(courseData);
  courseData.course[entityName].splice(0, 1);
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const schema = entityName === 'tags' ? TagSchema : TopicSchema;
  const syncedEntities = await util.dumpTableWithSchema(entityName, schema);
  const syncedEntity = syncedEntities.find((e) => e.name === oldEntity.name);
  assert.isUndefined(syncedEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testRemoveAll(entityName: 'tags' | 'topics') {
  const courseData = util.getCourseData();
  const { courseDir } = await util.writeAndSyncCourseData(courseData);

  // Remove all questions that could reference the entity.
  courseData.questions = {};

  // Remove all entities.
  courseData.course[entityName] = [];

  // Sync the course.
  await util.overwriteAndSyncCourseData(courseData, courseDir);

  // Ensure that the entity table is empty.
  const schema = entityName === 'tags' ? TagSchema : TopicSchema;
  const syncedEntities = await util.dumpTableWithSchema(entityName, schema);
  assert.isEmpty(syncedEntities);
}

async function testRename(entityName: 'tags' | 'topics') {
  const courseData = util.getCourseData();
  const oldEntity = makeEntity();
  courseData.course[entityName].unshift(oldEntity);
  const { courseDir } = await util.writeAndSyncCourseData(courseData);
  const oldName = courseData.course[entityName][0].name;
  const newName = 'new name';
  courseData.course[entityName][0].name = newName;
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const schema = entityName === 'tags' ? TagSchema : TopicSchema;
  const syncedEntities = await util.dumpTableWithSchema(entityName, schema);
  assert.isUndefined(syncedEntities.find((e) => e.name === oldName));
  const syncedEntity = syncedEntities.find((as) => as.name === newName);
  checkEntity(syncedEntity, oldEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testDuplicate(entityName: 'tags' | 'topics') {
  const courseData = util.getCourseData();
  const newEntity1 = makeEntity();
  const newEntity2 = makeEntity();
  newEntity2.color = 'green2';
  newEntity2.description = 'description for another new entity';
  courseData.course[entityName].push(newEntity1, newEntity2);
  await util.writeAndSyncCourseData(courseData);
  const schema = entityName === 'tags' ? TagSchema : TopicSchema;
  const syncedEntities = await util.dumpTableWithSchema(entityName, schema);
  const syncedEntity = syncedEntities.find((as) => as.name === newEntity1.name);
  checkEntity(syncedEntity, newEntity2);
  const syncedCourses = await util.dumpTableWithSchema('pl_courses', CourseSchema);
  const syncedCourse = syncedCourses.find((c) => c.short_name === courseData.course.name);
  assert.isDefined(syncedCourse);
  assert.isNotNull(syncedCourse.sync_warnings);
  assert.match(syncedCourse.sync_warnings, new RegExp(`Found duplicates in '${entityName}'`));
}

async function testImplicit(entityName: 'tags' | 'topics') {
  const courseData = util.getCourseData();
  const question = courseData.questions[util.QUESTION_ID];
  if (entityName === 'tags') {
    question.tags = ['implicit'];
  } else {
    question.topic = 'implicit';
  }
  await util.writeAndSyncCourseData(courseData);
  const schema = entityName === 'tags' ? TagSchema : TopicSchema;
  const syncedEntities = await util.dumpTableWithSchema(entityName, schema);
  const syncedEntity = syncedEntities.find((as) => as.name === 'implicit');
  checkEntity(syncedEntity, {
    name: 'implicit',
    color: 'gray1',
    description: 'implicit',
    implicit: true,
    // Implicit entities should come last.
    number: syncedEntities.length,
  });
}

describe('Tag/topic syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it('adds a new tag', async () => {
    await testAdd('tags');
  });

  it('adds a new topic', async () => {
    await testAdd('topics');
  });

  it('adds a new tag with missing description', async () => {
    await testAddMissingDescription('tags');
  });

  it('adds a new topic with missing description', async () => {
    await testAddMissingDescription('topics');
  });

  it('removes a tag', async () => {
    await testRemove('tags');
  });

  it('removes a topic', async () => {
    await testRemove('topics');
  });

  it('removes all tags', async () => {
    await testRemoveAll('tags');
  });

  it('removes all topics', async () => {
    await testRemoveAll('topics');
  });

  it('renames a tag', async () => {
    await testRename('tags');
  });

  it('renames a topic', async () => {
    await testRename('topics');
  });

  it('records a warning if two tags have the same name', async () => {
    await testDuplicate('tags');
  });

  it('records a warning if two topics have the same name', async () => {
    await testDuplicate('topics');
  });

  it('syncs an implicit tag', async () => {
    await testImplicit('tags');
  });

  it('syncs an implicit topic', async () => {
    await testImplicit('topics');
  });

  it('adds corresponding default tags if used by questions but not specified in courseData', async () => {
    const courseData = util.getCourseData();

    // The symbolic tag is in DEFAULT_TAGS but not in courseData
    courseData.questions[util.QUESTION_ID].tags!.push('symbolic');

    // Similarly, the drawing tag is in DEFAULT_TAGS but not in courseData
    courseData.questions[util.QUESTION_ID].tags!.push('drawing');

    await util.writeAndSyncCourseData(courseData);

    const syncedTags = await util.dumpTableWithSchema('tags', TagSchema);

    // Ensure that the symbolic tag was added and matches the corresponding tag in DEFAULT_TAGS
    const syncedSymbolicTag = syncedTags.find((t) => t.name === 'symbolic');
    checkEntity(syncedSymbolicTag, {
      name: 'symbolic',
      color: 'blue1',
      description: 'The answer format is a symbolic expression.',
    });

    // Similarly, ensure that the drawing tag was added and matches the corresponding tag in DEFAULT_TAGS
    const syncedDrawingTag = syncedTags.find((t) => t.name === 'drawing');
    checkEntity(syncedDrawingTag, {
      name: 'drawing',
      color: 'yellow1',
      description:
        'The answer format requires drawing on a canvas to input a graphical representation of an answer.',
    });
  });

  /**
   * This tests a specific case that at one point we didn't handle correctly: a
   * course without any explicit topics and with a question that uses a
   * topic that isn't in the list of defaults.
   */
  it('handles course with only a single implicit topic', async () => {
    const courseData = util.getCourseData();

    // Remove all course topics.
    courseData.course.topics = [];

    // Remove all course instances.
    courseData.courseInstances = {};

    // Save a reference to the test question.
    const testQuestion = courseData.questions[util.QUESTION_ID];

    // Remove all questions.
    courseData.questions = {};

    // Add a single question that uses a topic that isn't in the list of defaults.
    courseData.questions[util.QUESTION_ID] = testQuestion;
    testQuestion.topic = 'X';

    // Sync the course.
    await util.writeAndSyncCourseData(courseData);

    // Assert that the expected topic is present and that it has the correct number.
    const syncedTopics = await util.dumpTableWithSchema('topics', TopicSchema);
    assert.lengthOf(syncedTopics, 1);
    assert.equal(syncedTopics[0].name, 'X');
    assert.equal(syncedTopics[0].number, 1);
  });

  it('handles course with only a single implicit tag', async () => {
    const courseData = util.getCourseData();

    // Remove all course tags.
    courseData.course.tags = [];

    // Remove all course instances.
    courseData.courseInstances = {};

    // Save a reference to the test question.
    const testQuestion = courseData.questions[util.QUESTION_ID];

    // Remove all questions.
    courseData.questions = {};

    // Add a single question that uses a tag that isn't in the list of defaults.
    courseData.questions[util.QUESTION_ID] = testQuestion;
    testQuestion.tags = ['X'];

    // Sync the course.
    await util.writeAndSyncCourseData(courseData);

    // Assert that the expected tag is present and that it has the correct number.
    const syncedTags = await util.dumpTableWithSchema('tags', TagSchema);
    assert.lengthOf(syncedTags, 1);
    assert.equal(syncedTags[0].name, 'X');
    assert.equal(syncedTags[0].number, 1);
  });

  it('syncs JSON comments correctly', async () => {
    const courseData = util.getCourseData();
    const newEntityStringComment = {
      name: 'String comment',
      color: 'green1',
      description: 'description for a new entity',
      comment: 'string comment',
    } as TagJsonInput | TopicJsonInput;
    const newEntityArrayComment = {
      name: 'Array comment',
      color: 'green1',
      description: 'description for a new entity',
      comment: ['comment1', 'comment2'],
    } as TagJsonInput | TopicJsonInput;
    const newEntityObjectComment = {
      name: 'Object comment',
      color: 'green1',
      description: 'description for a new entity',
      comment: { comment1: 'comment1', comment2: 'comment2' },
    } as TagJsonInput | TopicJsonInput;
    courseData.course.tags.push(
      newEntityStringComment,
      newEntityArrayComment,
      newEntityObjectComment,
    );
    courseData.course.topics.push(
      newEntityStringComment,
      newEntityArrayComment,
      newEntityObjectComment,
    );
    await util.writeAndSyncCourseData(courseData);
    const syncedTags = await util.dumpTableWithSchema('tags', TagSchema);
    const syncedStringTag = syncedTags.find((t) => t.name === 'String comment');
    const syncedArrayTag = syncedTags.find((t) => t.name === 'Array comment');
    const syncedObjectTag = syncedTags.find((t) => t.name === 'Object comment');
    assert.equal(syncedStringTag?.json_comment, 'string comment');
    assert.deepEqual(syncedArrayTag?.json_comment, ['comment1', 'comment2']);
    assert.deepEqual(syncedObjectTag?.json_comment, { comment1: 'comment1', comment2: 'comment2' });
    const syncedTopics = await util.dumpTableWithSchema('topics', TopicSchema);
    const syncedStringTopic = syncedTopics.find((t) => t.name === 'String comment');
    const syncedArrayTopic = syncedTopics.find((t) => t.name === 'Array comment');
    const syncedObjectTopic = syncedTopics.find((t) => t.name === 'Object comment');
    assert.equal(syncedStringTopic?.json_comment, 'string comment');
    assert.deepEqual(syncedArrayTopic?.json_comment, ['comment1', 'comment2']);
    assert.deepEqual(syncedObjectTopic?.json_comment, {
      comment1: 'comment1',
      comment2: 'comment2',
    });
  });
});
