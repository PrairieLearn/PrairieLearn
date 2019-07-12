
const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

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
 * @param {any} syncedTag - The tag from the database
 * @param {import('./util').Tag | import('./util').Topic} entity - The entity from `infoCourse.json`.
 */
function checkEntity(syncedEntity, entity) {
  assert.isOk(syncedEntity);
  assert.equal(syncedEntity.name, entity.name);
  assert.equal(syncedEntity.color, entity.color);
  assert.equal(syncedEntity.description, entity.description);
}

function checkEntityOrder(entityName, syncedEntities, courseData) {
  courseData.course[entityName].forEach((entity, index) => {
    assert.equal(syncedEntities.find(e => e.name === entity.name).number, index + 1);
  });
}

async function testAdd(entityName) {
  const { courseData, courseDir } = await util.createAndSyncCourseData();
  const newEntity = makeEntity();
  courseData.course[entityName].push(newEntity);
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const syncedEntities = await util.dumpTable(entityName);
  const syncedEntity = syncedEntities.find(e => e.name === newEntity.name);
  checkEntity(syncedEntity, newEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testRemove(entityName) {
  const courseData = util.getCourseData();
  const oldEntity = makeEntity();
  courseData.course[entityName].unshift(oldEntity);
  const courseDir = await util.writeAndSyncCourseData(courseData);
  courseData.course[entityName].splice(0, 1);
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const syncedEntities = await util.dumpTable(entityName);
  const syncedEntity = syncedEntities.find(e => e.name === oldEntity.name);
  assert.isUndefined(syncedEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

async function testRename(entityName) {
  const courseData = util.getCourseData();
  const oldEntity = makeEntity();
  courseData.course[entityName].unshift(oldEntity);
  const courseDir = await util.writeAndSyncCourseData(courseData);
  const oldName = courseData.course[entityName][0].name;
  const newName = 'new name';
  courseData.course[entityName][0].name = newName;
  await util.overwriteAndSyncCourseData(courseData, courseDir);
  const syncedEntities = await util.dumpTable(entityName);
  assert.isUndefined(syncedEntities.find(e => e.name === oldName));
  const syncedEntity = syncedEntities.find(as => as.name = newName);
  checkEntity(syncedEntity, oldEntity);
  checkEntityOrder(entityName, syncedEntities, courseData);
}

describe('Tag/topic syncing', () => {
  // use when changing sprocs
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

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
});
