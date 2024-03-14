import * as helperDb from '../../tests/helperDb';
import { getOrCreateUser } from '../../tests/utils/auth';
import { ensurePlanGrant } from './plan-grants';

describe('plan-grants', () => {
  before(helperDb.before);
  after(helperDb.after);

  describe('insertPlanGrant', () => {
    it('creates a plan grant with audit logs', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const user = await getOrCreateUser({
          uid: 'student@example.com',
          name: 'Example Student',
          uin: 'student',
        });

        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'basic',
            type: 'stripe',
            user_id: user.user_id,
          },
          authn_user_id: user.user_id,
        });
      });
    });

    it('is idempotent', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        const user = await getOrCreateUser({
          uid: 'student@example.com',
          name: 'Example Student',
          uin: 'student',
        });

        const options = {
          plan_grant: {
            plan_name: 'basic',
            type: 'stripe',
            user_id: user.user_id,
          },
          authn_user_id: user.user_id,
        } as const;

        await ensurePlanGrant(options);
        await ensurePlanGrant(options);
      });
    });
  });
});
