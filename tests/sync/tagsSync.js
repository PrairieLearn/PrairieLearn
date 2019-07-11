
const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

function makeTag() {
  return {
    name: 'a new tag',
    color: 'green1',
    description: 'description for a new tag',
  };
}

/**
 * Checks that the tag present in the database matches the data
 * from the original tag in `infoCourse.json`.
 * 
 * @param {any} syncedTag - The tag from the database
 * @param {import('./util').Tag} tag - The tag from `infoCourse.json`.
 */
function checkTag(syncedTag, tag) {
  assert.isOk(syncedTag);
  assert.equal(syncedTag.name, tag.name);
  assert.equal(syncedTag.color, tag.color);
  assert.equal(syncedTag.description, tag.description);
}

function checkTagOrder(syncedTags, courseData) {
  courseData.course.tags.forEach((tag, index) => {
    assert.equal(syncedTags.find(t => t.name === tag.name).number, index + 1);
  });
}

describe('Assessment set syncing', () => {
  // use when changing sprocs
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('adds a new tag', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newTag = makeTag();
    courseData.course.tags.push(newTag);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedTags = await util.dumpTable('tags');
    const syncedTag = syncedTags.find(tag => tag.name === newTag.name);
    checkTag(syncedTag, newTag);
    checkTagOrder(syncedTags, courseData);
  });

  it('removes a tag', async () => {
    const courseData = util.getCourseData();
    const oldTag = makeTag();
    courseData.course.tags.unshift(oldTag);
    const courseDir = await util.writeAndSyncCourseData(courseData);
    courseData.course.tags.splice(0, 1);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedTags = await util.dumpTable('tags');
    const syncedTag = syncedTags.find(tag => tag.name === oldTag.name);
    assert.isUndefined(syncedTag);
    checkTagOrder(syncedTags, courseData);
  });

  it('renames a tag', async () => {
    const courseData = util.getCourseData();
    const oldTag = makeTag();
    courseData.course.tags.unshift(oldTag);
    const courseDir = await util.writeAndSyncCourseData(courseData);
    const oldName = courseData.course.tags[0].name;
    const newName = 'new name';
    courseData.course.tags[0].name = newName;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedTags = await util.dumpTable('tags');
    assert.isUndefined(syncedTags.find(tag => tag.name === oldName));
    const syncedTag = syncedTags.find(as => as.name = newName);
    checkTag(syncedTag, oldTag);
    checkTagOrder(syncedTags, courseData);
  });
});
