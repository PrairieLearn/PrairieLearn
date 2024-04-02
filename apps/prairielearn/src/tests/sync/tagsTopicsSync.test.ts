import { assert } from 'chai';
import * as util from './util';
import * as helperDb from '../helperDb';

/**
 * Topics and tags are currently almost identical, so we test them together
 * with a set of helper functions.
 */

/**
 * Makes a new tag/topic to test with.
 */
function makeEntity() {
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

async function testAdd(entityName) {
  const { courseData, courseDir } = await util.createAndSyncCourseData();
  const newEntity = makeEntity();
  courseData.course[entityName].push(newEntity);
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const syncedEntities = await util.dumpTable(entityName);
  const syncedEntity = syncedEntities.find((e) => e.name === newEntity.name);
  checkEntity(syncedEntity, newEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testRemove(entityName) {
  const courseData = util.getCourseData();
  const oldEntity = makeEntity();
  courseData.course[entityName].unshift(oldEntity);
  const { courseDir } = await util.writeAndSyncCourseData(courseData);
  courseData.course[entityName].splice(0, 1);
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const syncedEntities = await util.dumpTable(entityName);
  const syncedEntity = syncedEntities.find((e) => e.name === oldEntity.name);
  assert.isUndefined(syncedEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testRename(entityName) {
  const courseData = util.getCourseData();
  const oldEntity = makeEntity();
  courseData.course[entityName].unshift(oldEntity);
  const { courseDir } = await util.writeAndSyncCourseData(courseData);
  const oldName = courseData.course[entityName][0].name;
  const newName = 'new name';
  courseData.course[entityName][0].name = newName;
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const syncedEntities = await util.dumpTable(entityName);
  assert.isUndefined(syncedEntities.find((e) => e.name === oldName));
  const syncedEntity = syncedEntities.find((as) => as.name === newName);
  checkEntity(syncedEntity, oldEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testDuplicate(entityName) {
  const courseData = util.getCourseData();
  const newEntity1 = makeEntity();
  const newEntity2 = makeEntity();
  newEntity2.color = 'green2';
  newEntity2.description = 'description for another new entity';
  courseData.course[entityName].push(newEntity1);
  courseData.course[entityName].push(newEntity2);
  await util.writeAndSyncCourseData(courseData);
  const syncedEntities = await util.dumpTable(entityName);
  const syncedEntity = syncedEntities.find((as) => as.name === newEntity1.name);
  checkEntity(syncedEntity, newEntity2);
  const syncedCourses = await util.dumpTable('pl_courses');
  const syncedCourse = syncedCourses.find((c) => c.short_name === courseData.course.name);
  assert.match(syncedCourse?.sync_warnings, new RegExp(`Found duplicates in '${entityName}'`));
}

describe('Tag/topic syncing', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('reset testing database', helperDb.resetDatabase);

  it('adds a new tag', async () => {
    await testAdd('tags');
  });

  it('adds a new topic', async () => {
    await testAdd('topics');
  });

  it('removes a tag', async () => {
    await testRemove('tags');
  });

  it('removes a topic', async () => {
    await testRemove('topics');
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
});
