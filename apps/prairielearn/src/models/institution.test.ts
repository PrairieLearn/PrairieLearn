import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { updateInstitutionSetting } from './institution-settings.js';
import { selectAllInstitutionsWithSettings } from './institution.js';

describe('institution model', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  describe('selectAllInstitutionsWithSettings', () => {
    it('returns a full settings object even when no settings row exists', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const institutions = await selectAllInstitutionsWithSettings();
        const row = institutions.find((i) => i.institution.id === '1');

        assert.isDefined(row);
        assert.deepEqual(row.institution_settings, {
          institution_id: '1',
          course_request_message: null,
          github_course_owner: null,
        });
      });
    });

    it('reflects a saved github_course_owner', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const user = await getOrCreateUser({
          uid: 'institution-model@example.com',
          name: 'Institution Model Test User',
          uin: 'institution-model@example.com',
          email: 'institution-model@example.com',
        });
        await updateInstitutionSetting({
          institution_id: '1',
          field: 'github_course_owner',
          value: 'ExampleOrg',
          authn_user_id: user.id,
        });

        const institutions = await selectAllInstitutionsWithSettings();
        const row = institutions.find((i) => i.institution.id === '1');

        assert.isDefined(row);
        assert.equal(row.institution_settings.github_course_owner, 'ExampleOrg');
      });
    });
  });
});
