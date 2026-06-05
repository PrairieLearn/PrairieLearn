import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import type { ChangedFiles } from '../../lib/chunks.js';
import type { Course } from '../../lib/db-types.js';
import { selectCourseById } from '../../models/course.js';
import * as helperDb from '../../tests/helperDb.js';
import * as util from '../../tests/sync/util.js';

import { type SyncEdge, type SyncGraph, type SyncNode, runFastSync } from './engine.js';

/** Builds a {@link ChangedFiles} with only modified paths. */
const changed = (modified: string[]): ChangedFiles => ({ modified, deleted: [], renamed: [] });

/**
 * Builds a {@link SyncNode} that does nothing by default, overriding only the
 * behavior a given test cares about. Payloads in these tests are plain strings,
 * so the default `key` is the payload itself.
 */
function fakeNode(overrides: Partial<SyncNode> & Pick<SyncNode, 'type'>): SyncNode {
  return {
    key: String,
    match: async () => ({ payloads: [], claimedFiles: [] }),
    sync: async () => ({ status: 'ok' }),
    ...overrides,
  };
}

const graph = (nodes: SyncNode[], edges: SyncEdge[] = []): SyncGraph => ({ nodes, edges });

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
      match: async () => ({ payloads: ['1'], claimedFiles: ['a.json'] }),
    });

    const result = await runFastSync(course, changed(['a.json', 'b.json']), graph([node]));
    assert.isFalse(result.ok);
  });

  it('falls back when nothing matches the diff', async () => {
    const result = await runFastSync(course, changed(['a.json']), graph([fakeNode({ type: 'A' })]));
    assert.isFalse(result.ok);
  });

  it('falls back when the graph has a dependency cycle', async () => {
    const a = fakeNode({
      type: 'A',
      match: async () => ({ payloads: ['1'], claimedFiles: ['f'] }),
    });
    const edges: SyncEdge[] = [
      { from: 'A', to: 'B', resolve: async () => [] },
      { from: 'B', to: 'A', resolve: async () => [] },
    ];

    const result = await runFastSync(
      course,
      changed(['f']),
      graph([a, fakeNode({ type: 'B' })], edges),
    );
    assert.isFalse(result.ok);
  });

  it('syncs dirty nodes and their dependents in topological order', async () => {
    const order: string[] = [];
    const assessment = fakeNode({
      type: 'Assessment',
      sync: async (_course, payload) => {
        order.push(`Assessment:${String(payload)}`);
        return { status: 'ok' };
      },
    });
    const question = fakeNode({
      type: 'Question',
      match: async () => ({ payloads: ['q1'], claimedFiles: ['questions/q1/info.json'] }),
      sync: async (_course, payload) => {
        order.push(`Question:${String(payload)}`);
        return { status: 'ok' };
      },
    });
    const edge: SyncEdge = { from: 'Question', to: 'Assessment', resolve: async () => ['a1'] };

    // Node order is deliberately the reverse of topological order.
    const result = await runFastSync(
      course,
      changed(['questions/q1/info.json']),
      graph([assessment, question], [edge]),
    );

    assert.isTrue(result.ok);
    assert.deepEqual(order, ['Question:q1', 'Assessment:a1']);
  });

  it('collects chunks from synced nodes', async () => {
    const node = fakeNode({
      type: 'Q',
      match: async () => ({ payloads: ['1'], claimedFiles: ['f'] }),
      sync: async () => ({ status: 'ok', chunks: [{ type: 'question', questionName: 'foo' }] }),
    });

    const result = await runFastSync(course, changed(['f']), graph([node]));
    assert.isTrue(result.ok);
    assert.deepEqual(result.chunks, [{ type: 'question', questionName: 'foo' }]);
  });

  it('falls back with no chunks when any node cannot fast-sync', async () => {
    const bad = fakeNode({ type: 'B', sync: async () => ({ status: 'fallback' }) });
    const good = fakeNode({
      type: 'A',
      match: async () => ({ payloads: ['1'], claimedFiles: ['f'] }),
      sync: async () => ({ status: 'ok', chunks: [{ type: 'question', questionName: 'foo' }] }),
    });
    const edge: SyncEdge = { from: 'A', to: 'B', resolve: async () => ['1'] };

    const result = await runFastSync(course, changed(['f']), graph([good, bad], [edge]));
    assert.isFalse(result.ok);
    assert.deepEqual(result.chunks, []);
  });

  it('dedups shared dependents so each instance syncs once', async () => {
    let assessmentSyncs = 0;
    const assessment = fakeNode({
      type: 'Assessment',
      sync: async () => {
        assessmentSyncs += 1;
        return { status: 'ok' };
      },
    });
    const question = fakeNode({
      type: 'Question',
      match: async () => ({ payloads: ['q1', 'q2'], claimedFiles: ['f'] }),
    });
    // Both questions depend on the same assessment instance.
    const edge: SyncEdge = {
      from: 'Question',
      to: 'Assessment',
      resolve: async (_course, sources) => sources.map(() => 'shared'),
    };

    const result = await runFastSync(course, changed(['f']), graph([assessment, question], [edge]));
    assert.isTrue(result.ok);
    assert.equal(assessmentSyncs, 1);
  });
});
