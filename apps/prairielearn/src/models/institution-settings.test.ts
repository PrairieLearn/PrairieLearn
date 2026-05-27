import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

import { selectAuditEventsByInstitutionId } from './audit-event.js';
import { updateInstitutionCourseRequestMessage } from './institution-settings.js';

describe('institution-settings model', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  describe('updateInstitutionCourseRequestMessage', () => {
    it('updates the message and records audit events', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const user = await getOrCreateUser({
          uid: 'institution-settings@example.com',
          name: 'Institution Settings Admin',
          uin: 'institution-settings@example.com',
          email: 'institution-settings@example.com',
        });

        const insertedSettings = await updateInstitutionCourseRequestMessage({
          institution_id: '1',
          course_request_message: 'Initial course request message',
          authn_user_id: user.id,
        });

        const updatedSettings = await updateInstitutionCourseRequestMessage({
          institution_id: '1',
          course_request_message: 'Updated course request message',
          authn_user_id: user.id,
        });

        const events = await selectAuditEventsByInstitutionId({
          institution_id: '1',
          table_names: ['institution_settings'],
        });

        assert.lengthOf(events, 2);

        assert.equal(events[0].action, 'update');
        assert.equal(events[0].action_detail, 'course_request_message');
        assert.equal(events[0].row_id, '1');
        assert.equal(events[0].agent_authn_user_id, user.id);
        assert.deepEqual(events[0].old_row, insertedSettings);
        assert.deepEqual(events[0].new_row, updatedSettings);

        assert.equal(events[1].action, 'insert');
        assert.equal(events[1].action_detail, 'course_request_message');
        assert.equal(events[1].row_id, '1');
        assert.isNull(events[1].old_row);
        assert.deepEqual(events[1].new_row, insertedSettings);
      });
    });
  });
});
