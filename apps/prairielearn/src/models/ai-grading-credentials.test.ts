import { strict as assert } from 'node:assert';

import { afterAll, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import {
  deleteCredential,
  replaceCustomCredential,
  selectCredentials,
} from './ai-grading-credentials.js';
import { selectAuditEvents } from './audit-event.js';

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
        ai_grading_last_selected_model: z.string().nullable(),
      }),
    );
    assert.equal(remembered.ai_grading_last_selected_credential_id, null);
    assert.equal(remembered.ai_grading_last_selected_model, 'custom-test-model');
  });

  it('rolls back deletion, remembered selection and audit if replacement fails', async () => {
    const credential = await replaceCustomCredential({
      course_instance_id: '1',
      expected_credential_id: null,
      base_url: 'https://provider.example/v1',
      encrypted_secret_key: 'test-encrypted-key',
      created_by,
    });
    const assessment_question_id = await queryScalar(
      sql.remember_custom_credential,
      { credential_id: credential.id },
      IdSchema,
    );
    const auditParams = {
      course_instance_id: '1',
      agent_authn_user_id: created_by,
      table_names: ['course_instance_ai_grading_credentials'] as const,
    };
    const before = await selectAuditEvents({
      ...auditParams,
      table_names: [...auditParams.table_names],
    });
    await assert.rejects(
      replaceCustomCredential({
        course_instance_id: '1',
        expected_credential_id: credential.id,
        base_url: '',
        encrypted_secret_key: 'replacement-key',
        created_by,
      }),
      { code: '23514' },
    );
    assert.equal((await selectCredentials('1'))[0].id, credential.id);
    const remembered = await queryRow(
      sql.select_remembered_model,
      { assessment_question_id },
      z.object({
        ai_grading_last_selected_credential_id: IdSchema.nullable(),
        ai_grading_last_selected_model: z.string().nullable(),
      }),
    );
    assert.equal(remembered.ai_grading_last_selected_credential_id, credential.id);
    assert.equal(remembered.ai_grading_last_selected_model, 'custom-test-model');
    assert.deepEqual(
      await selectAuditEvents({ ...auditParams, table_names: [...auditParams.table_names] }),
      before,
    );
    const replacement = await replaceCustomCredential({
      course_instance_id: '1',
      expected_credential_id: credential.id,
      base_url: 'https://another.example/v1',
      encrypted_secret_key: 'replacement-key',
      created_by,
    });
    const cleared = await queryRow(
      sql.select_remembered_model,
      { assessment_question_id },
      z.object({
        ai_grading_last_selected_credential_id: IdSchema.nullable(),
        ai_grading_last_selected_model: z.string().nullable(),
      }),
    );
    assert.equal(cleared.ai_grading_last_selected_credential_id, null);
    assert.equal(cleared.ai_grading_last_selected_model, null);
    await deleteCredential({
      credential_id: replacement.id,
      course_instance_id: '1',
      authn_user_id: created_by,
    });
  });

  it('allows only one simultaneous first-time configuration save', async () => {
    const results = await Promise.allSettled(
      [1, 2].map((number) =>
        replaceCustomCredential({
          course_instance_id: '1',
          expected_credential_id: null,
          base_url: `https://provider-${number}.example/v1`,
          encrypted_secret_key: 'test-encrypted-key',
          created_by,
        }),
      ),
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.name, 'AiGradingCredentialConflictError');
    const stored = await selectCredentials('1');
    assert.equal(stored.length, 1);
    await deleteCredential({
      credential_id: stored[0].id,
      course_instance_id: '1',
      authn_user_id: created_by,
    });
  });
});
