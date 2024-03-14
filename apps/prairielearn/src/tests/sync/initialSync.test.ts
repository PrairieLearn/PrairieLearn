import { assert } from 'chai';
import * as util from './util';
import * as helperDb from '../helperDb';

describe('Initial Sync', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('reset testing database', helperDb.resetDatabase);

  it('correctly syncs content from disk to the database', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();

    const courses = await util.dumpTable('pl_courses');
    assert.lengthOf(courses, 1);
    const [course] = courses;
    assert.equal(course.short_name, courseData.course.name);
    assert.equal(course.path, courseDir);
    assert.isNull(course.deleted_at);

    const questions = await util.dumpTable('questions');
    assert.lengthOf(questions, Object.keys(courseData.questions).length);
    for (const qid of Object.keys(courseData.questions)) {
      const question = courseData.questions[qid];
      const syncedQuestion = questions.find((q) => q.qid === qid);
      assert.isOk(syncedQuestion);
      assert.equal(syncedQuestion?.uuid, question.uuid);
      assert.equal(syncedQuestion?.qid, qid);
      assert.equal(syncedQuestion?.directory, qid);
      const expectedType = question.type === 'v3' ? 'Freeform' : question.type;
      assert.equal(syncedQuestion?.type, expectedType);
      assert.equal(syncedQuestion?.title, question.title);
    }

    const topics = await util.dumpTable('topics');
    // Cannot precisely assert the length of the topics array given that we'll
    // have additional default topics added for us
    assert(topics.length >= courseData.course.topics.length);
    for (const topic of courseData.course.topics) {
      const syncedTopic = topics.find((t) => t.name === topic.name);
      assert.isOk(syncedTopic);
      assert.equal(syncedTopic?.name, topic.name);
      assert.equal(syncedTopic?.color, topic.color);
      assert.equal(syncedTopic?.description, topic.description);
    }

    const tags = await util.dumpTable('tags');
    // As above, we don't know exactly how many tags there will be
    assert(tags.length >= courseData.course.tags.length);
    for (const tag of courseData.course.tags) {
      const syncedTag = tags.find((t) => t.name === tag.name);
      assert.isOk(syncedTag);
      assert.equal(syncedTag?.name, tag.name);
      assert.equal(syncedTag?.color, tag.color);
      assert.equal(syncedTag?.description, tag.description);
    }
  });

  it('is idempotent when syncing the exact same course twice', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const snapshot = await util.captureDatabaseSnapshot();
    await util.syncCourseData(courseDir);
    const newSnapshot = await util.captureDatabaseSnapshot();
    util.assertSnapshotsMatch(newSnapshot, snapshot);
  });

  it('does not modify one course when syncing another', async () => {
    const courseData = util.getCourseData();
    await util.writeAndSyncCourseData(courseData);
    const firstSnapshot = await util.captureDatabaseSnapshot();
    await util.writeAndSyncCourseData(courseData);
    const secondSnapshot = await util.captureDatabaseSnapshot();
    util.assertSnapshotSubset(firstSnapshot, secondSnapshot);
  });
});
