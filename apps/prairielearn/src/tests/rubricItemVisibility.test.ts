import { afterAll, assert, beforeAll, test } from 'vitest';

import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import backfill from '../batched-migrations/20261111180101_rubric_items__show_to_students__backfill.js';
import { RubricItemSchema } from '../lib/db-types.js';

import * as helperDb from './helperDb.js';

const sql = loadSqlEquiv(import.meta.url);

beforeAll(helperDb.before);
afterAll(helperDb.after);

test('backfill preserves visibility for active and deleted rubric items within each batch', async () => {
  await execute(sql.insert_legacy_rubric_items);
  const items = await queryRows(sql.select_rubric_items, RubricItemSchema);

  await backfill.execute(BigInt(items[0].id), BigInt(items[1].id));
  const firstBatch = await queryRows(sql.select_rubric_items, RubricItemSchema);
  assert.deepEqual(
    firstBatch.map((item) => item.show_to_students),
    ['always', 'when_selected', 'always'],
  );

  const { max } = await backfill.getParameters();
  assert.equal(max, BigInt(items[2].id));
  await backfill.execute(BigInt(items[2].id), BigInt(items[2].id));
  const result = await queryRows(sql.select_rubric_items, RubricItemSchema);
  assert.deepEqual(
    result.map((item) => item.show_to_students),
    ['always', 'when_selected', 'when_selected'],
  );
  assert.isNotNull(result[2].deleted_at);
});
