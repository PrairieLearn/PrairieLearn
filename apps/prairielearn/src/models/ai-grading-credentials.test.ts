import { strict as assert } from 'node:assert';

import { afterAll, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

describe('custom AI grading credential constraints', () => {
  let created_by: string;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
    const user = await getOrCreateUser({
      uid: 'admin@example.com',
      name: 'Test Admin',
      uin: 'admin1',
      email: 'admin@example.com',
    });
    created_by = user.id;
  });

  afterAll(helperDb.after);

  it('requires a nonblank URL for custom credentials', async () => {
    for (const base_url of [null, '', '   ']) {
      await assert.rejects(
        queryScalar(sql.insert_custom_credential, { created_by, base_url }, IdSchema),
        { code: '23514' },
      );
    }
  });

  it('rejects a remembered credential that does not exist', async () => {
    await assert.rejects(
      queryScalar(sql.remember_custom_credential, { credential_id: '-1' }, IdSchema),
      { code: '23503' },
    );
  });

  it('allows one custom provider and clears its reference on deletion', async () => {
    const credential_id = await queryScalar(
      sql.insert_custom_credential,
      { created_by, base_url: 'https://provider.example/v1' },
      IdSchema,
    );
    await assert.rejects(
      queryScalar(
        sql.insert_custom_credential,
        { created_by, base_url: 'https://another.example/v1' },
        IdSchema,
      ),
      { code: '23505' },
    );
    const assessment_question_id = await queryScalar(
      sql.remember_custom_credential,
      { credential_id },
      IdSchema,
    );
    await execute(sql.delete_custom_credential, { credential_id });
    const remembered = await queryRow(
      sql.select_remembered_model,
      { assessment_question_id },
      z.object({
        ai_grading_last_selected_credential_id: IdSchema.nullable(),
        ai_grading_last_selected_model: z.string(),
      }),
    );
    assert.equal(remembered.ai_grading_last_selected_credential_id, null);
    assert.equal(remembered.ai_grading_last_selected_model, 'custom-test-model');
  });
});
