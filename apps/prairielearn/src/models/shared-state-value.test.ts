import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { makeAssessmentInstance } from '../lib/assessment.js';
import * as helperDb from '../tests/helperDb.js';
import * as util from '../tests/sync/util.js';

import { selectAssessmentByTid } from './assessment.js';
import { selectCourseInstanceByShortName } from './course-instances.js';
import { selectCourseById } from './course.js';
import { selectSharedStateObjectWithRevisionByName } from './shared-state-object.js';
import {
  type ResolvedSharedStateObject,
  readSharedStateValuesForAssessmentInstance,
  readSharedStateValuesForUser,
  writeSharedStateValuesForAssessmentInstance,
  writeSharedStateValuesForUser,
} from './shared-state-value.js';
import { selectOrInsertUserByUid } from './user.js';

const OBJECT_NAME = 'labProgress';
const OBJECT_UUID = 'b74f8c17-39bc-42aa-8a29-805d92a5a8a3';

async function setUpObjectAndTwoAssessmentInstances(): Promise<{
  object: ResolvedSharedStateObject;
  assessmentInstanceIdA: string;
  assessmentInstanceIdB: string;
}> {
  const courseData: util.CourseData = util.getCourseData();
  courseData.course.sharedState = {
    [OBJECT_NAME]: {
      uuid: OBJECT_UUID,
      scope: 'assessmentInstance',
      dataVersion: 1,
      properties: {
        count: { type: 'number', default: 0 },
        theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] },
      },
    },
  };
  const courseDir = await util.writeCourseToTempDirectory(courseData);
  const syncResults = await util.syncCourseData(courseDir);
  if (syncResults.status !== 'complete') {
    throw new Error(`Unexpected sync status: ${syncResults.status}`);
  }
  const courseId = syncResults.courseId;

  const course = await selectCourseById(courseId);
  const courseInstance = await selectCourseInstanceByShortName({
    course,
    shortName: util.COURSE_INSTANCE_ID,
  });
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: util.ASSESSMENT_ID,
  });

  const userA = await selectOrInsertUserByUid('shared-state-test-user-a@example.com');
  const userB = await selectOrInsertUserByUid('shared-state-test-user-b@example.com');

  const assessmentInstanceIdA = await makeAssessmentInstance({
    assessment,
    user_id: userA.id,
    authn_user_id: userA.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const assessmentInstanceIdB = await makeAssessmentInstance({
    assessment,
    user_id: userB.id,
    authn_user_id: userB.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });

  const objectWithRevision = await selectSharedStateObjectWithRevisionByName({
    course_id: courseId,
    name: OBJECT_NAME,
  });
  if (objectWithRevision?.revision == null) {
    throw new Error('Expected shared-state object to have a current revision after sync');
  }

  const object: ResolvedSharedStateObject = {
    id: objectWithRevision.id,
    revisionId: objectWithRevision.revision.id,
    properties: objectWithRevision.revision.properties,
  };

  return { object, assessmentInstanceIdA, assessmentInstanceIdB };
}

async function setUpObjectAndTwoUsers(): Promise<{
  object: ResolvedSharedStateObject;
  userIdA: string;
  userIdB: string;
}> {
  const courseData: util.CourseData = util.getCourseData();
  courseData.course.sharedState = {
    [OBJECT_NAME]: {
      uuid: OBJECT_UUID,
      scope: 'assessmentInstance',
      dataVersion: 1,
      properties: {
        count: { type: 'number', default: 0 },
        theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] },
      },
    },
  };
  const courseDir = await util.writeCourseToTempDirectory(courseData);
  const syncResults = await util.syncCourseData(courseDir);
  if (syncResults.status !== 'complete') {
    throw new Error(`Unexpected sync status: ${syncResults.status}`);
  }
  const courseId = syncResults.courseId;

  const userA = await selectOrInsertUserByUid('shared-state-preview-test-user-a@example.com');
  const userB = await selectOrInsertUserByUid('shared-state-preview-test-user-b@example.com');

  const objectWithRevision = await selectSharedStateObjectWithRevisionByName({
    course_id: courseId,
    name: OBJECT_NAME,
  });
  if (objectWithRevision?.revision == null) {
    throw new Error('Expected shared-state object to have a current revision after sync');
  }

  const object: ResolvedSharedStateObject = {
    id: objectWithRevision.id,
    revisionId: objectWithRevision.revision.id,
    properties: objectWithRevision.revision.properties,
  };

  return { object, userIdA: userA.id, userIdB: userB.id };
}

describe('Shared-state value read/write', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);
  beforeEach(helperDb.resetDatabase);

  it('reads schema defaults when nothing has been written', async () => {
    const { object, assessmentInstanceIdA } = await setUpObjectAndTwoAssessmentInstances();

    const values = await readSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects: { [OBJECT_NAME]: object },
    });

    assert.deepEqual(values[OBJECT_NAME], { count: 0, theme: 'sports' });
  });

  it('persists a write and reflects it on the next read', async () => {
    const { object, assessmentInstanceIdA } = await setUpObjectAndTwoAssessmentInstances();
    const objects = { [OBJECT_NAME]: object };

    const { issues } = await writeSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
      before: { [OBJECT_NAME]: { count: 0, theme: 'sports' } },
      after: { [OBJECT_NAME]: { count: 3, theme: 'sports' } },
    });
    assert.isEmpty(issues);

    const values = await readSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
    });
    assert.deepEqual(values[OBJECT_NAME], { count: 3, theme: 'sports' });
  });

  it('keeps different assessment instances isolated from each other', async () => {
    const { object, assessmentInstanceIdA, assessmentInstanceIdB } =
      await setUpObjectAndTwoAssessmentInstances();
    const objects = { [OBJECT_NAME]: object };

    await writeSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
      before: { [OBJECT_NAME]: { count: 0, theme: 'sports' } },
      after: { [OBJECT_NAME]: { count: 5, theme: 'sports' } },
    });

    const valuesA = await readSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
    });
    const valuesB = await readSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdB,
      objects,
    });

    assert.equal(valuesA[OBJECT_NAME].count, 5);
    assert.equal(valuesB[OBJECT_NAME].count, 0);
  });

  it('merges concurrent disjoint-field writes to the same assessment instance', async () => {
    const { object, assessmentInstanceIdA } = await setUpObjectAndTwoAssessmentInstances();
    const objects = { [OBJECT_NAME]: object };
    const baseline = { [OBJECT_NAME]: { count: 0, theme: 'sports' } };

    // Two "sibling questions" concurrently read the same baseline and each
    // patch a different field. Since each write locks the row, merges its
    // patch onto whatever the freshest value is, and writes that back, both
    // changes should survive regardless of which write wins the race.
    const [resultA, resultB] = await Promise.all([
      writeSharedStateValuesForAssessmentInstance({
        assessment_instance_id: assessmentInstanceIdA,
        objects,
        before: baseline,
        after: { [OBJECT_NAME]: { count: 7, theme: 'sports' } },
      }),
      writeSharedStateValuesForAssessmentInstance({
        assessment_instance_id: assessmentInstanceIdA,
        objects,
        before: baseline,
        after: { [OBJECT_NAME]: { count: 0, theme: 'cooking' } },
      }),
    ]);
    assert.isEmpty(resultA.issues);
    assert.isEmpty(resultB.issues);

    const values = await readSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
    });
    assert.deepEqual(values[OBJECT_NAME], { count: 7, theme: 'cooking' });
  });

  it('rejects a patch with an invalid value and leaves the stored value unchanged', async () => {
    const { object, assessmentInstanceIdA } = await setUpObjectAndTwoAssessmentInstances();
    const objects = { [OBJECT_NAME]: object };

    const { issues } = await writeSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
      before: { [OBJECT_NAME]: { count: 0, theme: 'sports' } },
      after: { [OBJECT_NAME]: { count: 0, theme: 'travel' } },
    });
    assert.lengthOf(issues, 1);
    assert.match(issues[0], /must be one of: sports, cooking/);

    const values = await readSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
    });
    assert.deepEqual(values[OBJECT_NAME], { count: 0, theme: 'sports' });
  });

  it('treats a no-op patch as nothing to write', async () => {
    const { object, assessmentInstanceIdA } = await setUpObjectAndTwoAssessmentInstances();
    const objects = { [OBJECT_NAME]: object };
    const baseline = { count: 0, theme: 'sports' };

    const { issues } = await writeSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
      before: { [OBJECT_NAME]: baseline },
      after: { [OBJECT_NAME]: baseline },
    });
    assert.isEmpty(issues);

    const values = await readSharedStateValuesForAssessmentInstance({
      assessment_instance_id: assessmentInstanceIdA,
      objects,
    });
    assert.deepEqual(values[OBJECT_NAME], baseline);
  });
});

describe('Shared-state value read/write, scoped to a user (preview mode)', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);
  beforeEach(helperDb.resetDatabase);

  it('reads schema defaults when nothing has been written', async () => {
    const { object, userIdA } = await setUpObjectAndTwoUsers();

    const values = await readSharedStateValuesForUser({
      user_id: userIdA,
      objects: { [OBJECT_NAME]: object },
    });

    assert.deepEqual(values[OBJECT_NAME], { count: 0, theme: 'sports' });
  });

  it('persists a write and reflects it on the next read', async () => {
    const { object, userIdA } = await setUpObjectAndTwoUsers();
    const objects = { [OBJECT_NAME]: object };

    const { issues } = await writeSharedStateValuesForUser({
      user_id: userIdA,
      objects,
      before: { [OBJECT_NAME]: { count: 0, theme: 'sports' } },
      after: { [OBJECT_NAME]: { count: 3, theme: 'sports' } },
    });
    assert.isEmpty(issues);

    const values = await readSharedStateValuesForUser({ user_id: userIdA, objects });
    assert.deepEqual(values[OBJECT_NAME], { count: 3, theme: 'sports' });
  });

  it('keeps different users isolated from each other', async () => {
    const { object, userIdA, userIdB } = await setUpObjectAndTwoUsers();
    const objects = { [OBJECT_NAME]: object };

    await writeSharedStateValuesForUser({
      user_id: userIdA,
      objects,
      before: { [OBJECT_NAME]: { count: 0, theme: 'sports' } },
      after: { [OBJECT_NAME]: { count: 5, theme: 'sports' } },
    });

    const valuesA = await readSharedStateValuesForUser({ user_id: userIdA, objects });
    const valuesB = await readSharedStateValuesForUser({ user_id: userIdB, objects });

    assert.equal(valuesA[OBJECT_NAME].count, 5);
    assert.equal(valuesB[OBJECT_NAME].count, 0);
  });

  it('merges concurrent disjoint-field writes for the same user', async () => {
    const { object, userIdA } = await setUpObjectAndTwoUsers();
    const objects = { [OBJECT_NAME]: object };
    const baseline = { [OBJECT_NAME]: { count: 0, theme: 'sports' } };

    const [resultA, resultB] = await Promise.all([
      writeSharedStateValuesForUser({
        user_id: userIdA,
        objects,
        before: baseline,
        after: { [OBJECT_NAME]: { count: 7, theme: 'sports' } },
      }),
      writeSharedStateValuesForUser({
        user_id: userIdA,
        objects,
        before: baseline,
        after: { [OBJECT_NAME]: { count: 0, theme: 'cooking' } },
      }),
    ]);
    assert.isEmpty(resultA.issues);
    assert.isEmpty(resultB.issues);

    const values = await readSharedStateValuesForUser({ user_id: userIdA, objects });
    assert.deepEqual(values[OBJECT_NAME], { count: 7, theme: 'cooking' });
  });

  it('rejects a patch with an invalid value and leaves the stored value unchanged', async () => {
    const { object, userIdA } = await setUpObjectAndTwoUsers();
    const objects = { [OBJECT_NAME]: object };

    const { issues } = await writeSharedStateValuesForUser({
      user_id: userIdA,
      objects,
      before: { [OBJECT_NAME]: { count: 0, theme: 'sports' } },
      after: { [OBJECT_NAME]: { count: 0, theme: 'travel' } },
    });
    assert.lengthOf(issues, 1);
    assert.match(issues[0], /must be one of: sports, cooking/);

    const values = await readSharedStateValuesForUser({ user_id: userIdA, objects });
    assert.deepEqual(values[OBJECT_NAME], { count: 0, theme: 'sports' });
  });

  it('treats a no-op patch as nothing to write', async () => {
    const { object, userIdA } = await setUpObjectAndTwoUsers();
    const objects = { [OBJECT_NAME]: object };
    const baseline = { count: 0, theme: 'sports' };

    const { issues } = await writeSharedStateValuesForUser({
      user_id: userIdA,
      objects,
      before: { [OBJECT_NAME]: baseline },
      after: { [OBJECT_NAME]: baseline },
    });
    assert.isEmpty(issues);

    const values = await readSharedStateValuesForUser({ user_id: userIdA, objects });
    assert.deepEqual(values[OBJECT_NAME], baseline);
  });
});
