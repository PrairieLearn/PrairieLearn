import { afterAll, beforeAll, describe, it } from 'vitest';

import * as helperDb from '../../tests/helperDb.js';
import { getOrCreateUser } from '../../tests/utils/auth.js';

import { ensurePlanGrant } from './plan-grants.js';

describe('plan-grants', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  describe('insertPlanGrant', () => {
    it('creates a plan grant with audit logs', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const user = await getOrCreateUser({
          uid: 'student@example.com',
          name: 'Example Student',
          uin: 'student',
          email: 'student@example.com',
        });

        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'basic',
            type: 'stripe',
            user_id: user.id,
          },
          authn_user_id: user.id,
        });
      });
    });

    it('is idempotent', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const user = await getOrCreateUser({
          uid: 'student@example.com',
          name: 'Example Student',
          uin: 'student',
          email: 'student@example.com',
        });

        const options = {
          plan_grant: {
            plan_name: 'basic',
            type: 'stripe',
            user_id: user.id,
          },
          authn_user_id: user.id,
        } as const;

        await ensurePlanGrant(options);
        await ensurePlanGrant(options);
      });
    });
  });
});
