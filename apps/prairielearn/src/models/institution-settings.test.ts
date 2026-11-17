import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectAuditEventsByInstitutionId } from './audit-event.js';
import { updateInstitutionSetting } from './institution-settings.js';

describe('institution-settings model', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  describe('updateInstitutionSetting', () => {
    it('updates the message and records audit events', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const user = await getOrCreateUser({
          uid: 'institution-settings@example.com',
          name: 'Institution Settings Admin',
          uin: 'institution-settings@example.com',
          email: 'institution-settings@example.com',
        });

        const insertedSettings = await updateInstitutionSetting({
          institution_id: '1',
          field: 'course_request_message',
          value: 'Initial course request message',
          authn_user_id: user.id,
        });

        const updatedSettings = await updateInstitutionSetting({
          institution_id: '1',
          field: 'course_request_message',
          value: 'Updated course request message',
          authn_user_id: user.id,
        });

        const events = await selectAuditEventsByInstitutionId({
          institution_id: '1',
          table_names: ['institution_settings'],
        });

        assert.lengthOf(events, 2);

        const insertEvent = events.find((event) => event.action === 'insert');
        const updateEvent = events.find((event) => event.action === 'update');

        assert.isDefined(insertEvent);
        assert.equal(insertEvent.action_detail, 'course_request_message');
        assert.equal(insertEvent.row_id, '1');
        assert.equal(insertEvent.agent_authn_user_id, user.id);
        assert.isNull(insertEvent.old_row);
        assert.deepEqual(insertEvent.new_row, insertedSettings);

        assert.isDefined(updateEvent);
        assert.equal(updateEvent.action_detail, 'course_request_message');
        assert.equal(updateEvent.row_id, '1');
        assert.equal(updateEvent.agent_authn_user_id, user.id);
        assert.deepEqual(updateEvent.old_row, insertedSettings);
        assert.deepEqual(updateEvent.new_row, updatedSettings);
      });
    });
  });
});
