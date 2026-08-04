import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  CourseSchema,
  QuestionSchema,
  SharedStateObjectRevisionSchema,
  SharedStateObjectSchema,
} from '../../lib/db-types.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

const SHARED_STATE_OBJECT_NAME = 'labProgress';
const SHARED_STATE_OBJECT_UUID = '8c741d31-29ff-4ddf-a14b-0f84f36e8d61';
const SHARED_STATE_LOCAL_NAME = 'progressState';

function withSharedStateDefinition(
  courseData: util.CourseData,
  overrides: Partial<{
    scope: 'assessmentInstance' | 'courseInstance';
    dataVersion: number;
    properties: Record<string, any>;
  }> = {},
) {
  courseData.course.sharedState = {
    [SHARED_STATE_OBJECT_NAME]: {
      uuid: SHARED_STATE_OBJECT_UUID,
      scope: overrides.scope ?? 'assessmentInstance',
      dataVersion: overrides.dataVersion ?? 1,
      properties: overrides.properties ?? {
        stage: { type: 'number', default: 0 },
        theme: { type: 'string', default: 'sports', enum: ['sports', 'cooking'] },
      },
    },
  };
}

async function selectSyncedCourse() {
  const courses = await util.dumpTableWithSchema('courses', CourseSchema);
  return courses[0];
}

async function selectSyncedQuestion(qid: string) {
  const questions = await util.dumpTableWithSchema('questions', QuestionSchema);
  return questions.find((q) => q.qid === qid) ?? null;
}

async function selectSyncedObjectWithRevision(name: string) {
  const objects = await util.dumpTableWithSchema('shared_state_objects', SharedStateObjectSchema);
  const object = objects.find((o) => o.name === name);
  if (object == null) return null;
  const revisions = await util.dumpTableWithSchema(
    'shared_state_object_revisions',
    SharedStateObjectRevisionSchema,
  );
  const revision = revisions.find((r) => r.id === object.current_revision_id) ?? null;
  return { object, revision };
}

describe('Shared-state object syncing', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);
  beforeEach(helperDb.resetDatabase);

  it('syncs a valid shared-state object definition', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData);
    courseData.questions[util.QUESTION_ID].sharedStateAccess = {
      [SHARED_STATE_LOCAL_NAME]: SHARED_STATE_OBJECT_NAME,
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourse = await selectSyncedCourse();
    assert.isNotOk(syncedCourse.sync_errors);

    const result = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);
    assert.isNotNull(result);
    assert.equal(result.revision?.data_version, 1);
    assert.equal(result.revision?.scope, 'assessment_instance');
    assert.deepEqual(Object.keys(result.revision?.properties ?? {}).sort(), ['stage', 'theme']);
    assert.equal(result.object.uuid, SHARED_STATE_OBJECT_UUID);

    const question = await selectSyncedQuestion(util.QUESTION_ID);
    assert.isNotOk(question?.sync_errors);
    assert.deepEqual(question?.shared_state_access, {
      [SHARED_STATE_LOCAL_NAME]: SHARED_STATE_OBJECT_NAME,
    });
  });

  it('reports an error when a question accesses an undeclared shared-state object', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].sharedStateAccess = {
      [SHARED_STATE_LOCAL_NAME]: 'doesNotExist',
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const question = await selectSyncedQuestion(util.QUESTION_ID);
    assert.isNotNull(question?.sync_errors);
    assert.match(question!.sync_errors, /"doesNotExist".*not declared/);
  });

  it('reports an error when two shared-state objects use the same UUID', async () => {
    const courseData: util.CourseData = util.getCourseData();
    withSharedStateDefinition(courseData);
    courseData.course.sharedState!.otherProgress = {
      uuid: SHARED_STATE_OBJECT_UUID,
      scope: 'assessmentInstance',
      dataVersion: 1,
      properties: {
        count: { type: 'number', default: 0 },
      },
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourse = await selectSyncedCourse();
    assert.isNotNull(syncedCourse.sync_errors);
    assert.match(syncedCourse.sync_errors, /use the same UUID/);
  });

  it('allows a question with shared-state access to be source shared', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData);
    courseData.questions[util.QUESTION_ID].sharedStateAccess = {
      [SHARED_STATE_LOCAL_NAME]: SHARED_STATE_OBJECT_NAME,
    };
    courseData.questions[util.QUESTION_ID].shareSourcePublicly = true;

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const question = await selectSyncedQuestion(util.QUESTION_ID);
    assert.isNotOk(question?.sync_errors);
  });

  it('rejects "courseInstance" scope as not yet supported', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData, { scope: 'courseInstance' });

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourse = await selectSyncedCourse();
    assert.isNotNull(syncedCourse.sync_errors);
    assert.match(syncedCourse.sync_errors, /not yet supported/);

    const result = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);
    assert.isNull(result?.revision ?? null);
  });

  it('rejects a property schema with an invalid default', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData, {
      properties: { stage: { type: 'number', default: 'zero' } },
    });

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourse = await selectSyncedCourse();
    assert.match(syncedCourse.sync_errors!, /default value must be of type "number"/);
  });

  it('creates a new revision under the same dataVersion for a compatible change', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData, {
      properties: { stage: { type: 'number', default: 0 } },
    });
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const before = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);
    assert.isNotNull(before?.revision);

    withSharedStateDefinition(courseData, {
      properties: {
        stage: { type: 'number', default: 0 },
        completed: { type: 'boolean', default: false },
      },
    });
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const after = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);
    assert.notEqual(after?.revision?.id, before?.revision?.id);
    assert.equal(after?.revision?.data_version, 1);
    assert.deepEqual(Object.keys(after?.revision?.properties ?? {}).sort(), ['completed', 'stage']);
  });

  it('does not create a new revision when re-syncing an unchanged definition', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const before = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const after = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);

    assert.equal(after?.revision?.id, before?.revision?.id);
  });

  it('rejects a breaking change without a dataVersion increase', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData, {
      properties: { stage: { type: 'number', default: 0 } },
    });
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const before = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);

    withSharedStateDefinition(courseData, {
      properties: { stage: { type: 'string', default: '0' } },
    });
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const syncedCourse = await selectSyncedCourse();
    assert.match(
      syncedCourse.sync_errors!,
      /without increasing "dataVersion".*changed type from "number" to "string"/,
    );

    const after = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);
    assert.equal(after?.revision?.id, before?.revision?.id);
  });

  it('allows a breaking change when dataVersion is increased, resetting the schema', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData, {
      dataVersion: 1,
      properties: { stage: { type: 'number', default: 0 } },
    });
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const before = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);

    withSharedStateDefinition(courseData, {
      dataVersion: 2,
      properties: { stage: { type: 'string', default: '0' } },
    });
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const syncedCourse = await selectSyncedCourse();
    assert.isNotOk(syncedCourse.sync_errors);

    const after = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);
    assert.notEqual(after?.revision?.id, before?.revision?.id);
    assert.equal(after?.revision?.data_version, 2);
    assert.equal((after?.revision?.properties as any).stage.type, 'string');
  });

  it('rejects a dataVersion that decreases from a value already used', async () => {
    const courseData = util.getCourseData();
    withSharedStateDefinition(courseData, { dataVersion: 2 });
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const before = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);

    withSharedStateDefinition(courseData, {
      dataVersion: 1,
      properties: { stage: { type: 'number', default: 1 } },
    });
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const syncedCourse = await selectSyncedCourse();
    assert.match(syncedCourse.sync_errors!, /data versions must not decrease or be reused/);

    const after = await selectSyncedObjectWithRevision(SHARED_STATE_OBJECT_NAME);
    assert.equal(after?.revision?.id, before?.revision?.id);
  });
});
