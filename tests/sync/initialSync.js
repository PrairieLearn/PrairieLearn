const { assert } = require('chai');
const util = require('./util');
const helperDb = require('../helperDb');

describe('Initial Sync', () => {
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('correctly syncs content from disk to the database', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToDisk(courseData);
    await util.syncCourseData(courseDir);

    const courses = await util.dumpTable('pl_courses');
    assert.lengthOf(courses, 1);
    const [course] = courses;
    assert.equal(course.short_name, courseData.course.name);
    assert.equal(course.path, courseDir);
    assert.isNull(course.deleted_at);

    const questions = await util.dumpTable('questions');
    assert.lengthOf(questions, 1);
    const [question] = questions;
    const syncedQuestion = courseData.questions['test'];
    assert.equal(question.uuid, syncedQuestion.uuid);
    assert.equal(question.qid, 'test');
    assert.equal(question.type, 'Freeform');
    assert.equal(question.title, syncedQuestion.title);

    const topics = await util.dumpTable('topics');
    assert.lengthOf(topics, 1);
    const [topic] = topics;
    const [syncedTopic] = courseData.course.topics;
    assert.equal(topic.name, syncedTopic.name);
    assert.equal(topic.color, syncedTopic.color);
    assert.equal(topic.description, syncedTopic.description);
  });

  it('is idempotent when syncing the exact same course twice', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToDisk(courseData);
    await util.syncCourseData(courseDir);
    const snapshot = await util.captureDatabaseSnapshot();
    await util.syncCourseData(courseDir);
    const newSnapshot = await util.captureDatabaseSnapshot();
    assert.deepEqual(newSnapshot, snapshot);
  });
});
