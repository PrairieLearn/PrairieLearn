import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import type { Course } from '../../lib/db-types.js';
import { selectCourseById } from '../../models/course.js';
import * as helperDb from '../../tests/helperDb.js';
import * as util from '../../tests/sync/util.js';

import { type DirtyNode, type SyncNode, runFastSync } from './engine.js';

/**
 * Builds a {@link SyncNode} that does nothing by default, overriding only the
 * behavior a given test cares about.
 */
function fakeNode(overrides: Partial<SyncNode> & Pick<SyncNode, 'type' | 'topoRank'>): SyncNode {
  return {
    match: async () => ({ nodes: [], claimedFiles: [] }),
    dependents: async () => [],
    sync: async () => ({ status: 'ok' }),
    ...overrides,
  };
}

const dirty = (type: string, key: string): DirtyNode => ({ type, key, payload: null });

describe('runFastSync engine', () => {
  // The fake nodes below never touch the database, but `runFastSync` opens a
  // transaction, so we need a live pool. A real course satisfies the types.
  let course: Course;

  beforeAll(async () => {
    await helperDb.before();
    const { syncResults } = await util.createAndSyncCourseData();
    course = await selectCourseById(syncResults.courseId);
  });

  afterAll(helperDb.after);

  it('falls back when a changed file is not claimed by any node', async () => {
    const node = fakeNode({
      type: 'A',
      topoRank: 0,
      match: async () => ({ nodes: [dirty('A', '1')], claimedFiles: ['a.json'] }),
    });

    const result = await runFastSync(course, ['a.json', 'b.json'], [node]);
    assert.isFalse(result.ok);
  });

  it('falls back when nothing matches the diff', async () => {
    const result = await runFastSync(course, ['a.json'], [fakeNode({ type: 'A', topoRank: 0 })]);
    assert.isFalse(result.ok);
  });

  it('syncs dirty nodes and their dependents in topological order', async () => {
    const order: string[] = [];
    const assessment = fakeNode({
      type: 'Assessment',
      topoRank: 20,
      sync: async (_course, node) => {
        order.push(`Assessment:${node.key}`);
        return { status: 'ok' };
      },
    });
    const question = fakeNode({
      type: 'Question',
      topoRank: 10,
      match: async () => ({
        nodes: [dirty('Question', 'q1')],
        claimedFiles: ['questions/q1/info.json'],
      }),
      dependents: async () => [dirty('Assessment', 'a1')],
      sync: async (_course, node) => {
        order.push(`Question:${node.key}`);
        return { status: 'ok' };
      },
    });

    // Registry order is deliberately the reverse of topo order.
    const result = await runFastSync(course, ['questions/q1/info.json'], [assessment, question]);

    assert.isTrue(result.ok);
    assert.deepEqual(order, ['Question:q1', 'Assessment:a1']);
  });

  it('collects chunks from synced nodes', async () => {
    const node = fakeNode({
      type: 'Q',
      topoRank: 0,
      match: async () => ({ nodes: [dirty('Q', '1')], claimedFiles: ['f'] }),
      sync: async () => ({ status: 'ok', chunks: [{ type: 'question', questionName: 'foo' }] }),
    });

    const result = await runFastSync(course, ['f'], [node]);
    assert.isTrue(result.ok);
    assert.deepEqual(result.chunks, [{ type: 'question', questionName: 'foo' }]);
  });

  it('falls back with no chunks when any node cannot fast-sync', async () => {
    const bad = fakeNode({ type: 'B', topoRank: 20, sync: async () => ({ status: 'fallback' }) });
    const good = fakeNode({
      type: 'A',
      topoRank: 10,
      match: async () => ({ nodes: [dirty('A', '1')], claimedFiles: ['f'] }),
      dependents: async () => [dirty('B', '1')],
      sync: async () => ({ status: 'ok', chunks: [{ type: 'question', questionName: 'foo' }] }),
    });

    const result = await runFastSync(course, ['f'], [good, bad]);
    assert.isFalse(result.ok);
    assert.deepEqual(result.chunks, []);
  });

  it('dedups shared dependents so each instance syncs once', async () => {
    let assessmentSyncs = 0;
    const assessment = fakeNode({
      type: 'Assessment',
      topoRank: 20,
      sync: async () => {
        assessmentSyncs += 1;
        return { status: 'ok' };
      },
    });
    const question = fakeNode({
      type: 'Question',
      topoRank: 10,
      match: async () => ({
        nodes: [dirty('Question', 'q1'), dirty('Question', 'q2')],
        claimedFiles: ['f'],
      }),
      // Both questions depend on the same assessment instance.
      dependents: async (_course, nodes) => nodes.map(() => dirty('Assessment', 'shared')),
      sync: async () => ({ status: 'ok' }),
    });

    const result = await runFastSync(course, ['f'], [assessment, question]);
    assert.isTrue(result.ok);
    assert.equal(assessmentSyncs, 1);
  });
});
