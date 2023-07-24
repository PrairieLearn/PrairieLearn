import { assert } from 'chai';

import helperServer = require('../../../tests/helperServer');
import {
  getPlanGrantsForContext,
  getPlanGrantsForContextRecursive,
  getPlanGrantsForCourseInstance,
  getPlanNamesFromPlanGrants,
  getRequiredPlansForCourseInstance,
  reconcilePlanGrantsForCourseInstance,
  reconcilePlanGrantsForInstitution,
  updateRequiredPlansForCourseInstance,
} from './plans';
import { insertPlanGrant } from '../../models/plan-grants';
import { insertEnrollment } from '../../../models/enrollment';
import { runInTransactionAsync } from '@prairielearn/postgres';

class RollbackTransactionError extends Error {
  constructor() {
    super('Rollback transaction');
    this.name = 'RollbackTransactionError';
  }
}

/**
 * Helper function to discard any database modifications made during a test.
 */
async function runInTransactionAndRollback(fn: () => Promise<void>) {
  await runInTransactionAsync(async () => {
    await fn();
    throw new RollbackTransactionError();
  }).catch((err) => {
    if (err instanceof RollbackTransactionError) {
      return;
    }
    throw err;
  });
}

describe('plans', () => {
  before(helperServer.before());
  after(helperServer.after);

  describe('reconcilePlanGrantsForInstitution', () => {
    it('persists updates', async () => {
      await runInTransactionAndRollback(async () => {
        await reconcilePlanGrantsForInstitution(
          '1',
          [{ plan: 'compute', grantType: 'invoice' }],
          '1',
        );
        let planGrants = await getPlanGrantsForContext({ institution_id: '1' });
        assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'invoice'));

        await reconcilePlanGrantsForInstitution('1', [{ plan: 'compute', grantType: 'gift' }], '1');
        planGrants = await getPlanGrantsForContext({ institution_id: '1' });
        assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'gift'));

        await reconcilePlanGrantsForInstitution('1', [], '1');
        planGrants = await getPlanGrantsForContext({ institution_id: '1' });
        assert.deepEqual(planGrants, []);
      });
    });
  });

  describe('reconcilePlanGrantsForCourseInstance', () => {
    it('persists updates', async () => {
      await runInTransactionAndRollback(async () => {
        await reconcilePlanGrantsForCourseInstance(
          '1',
          [{ plan: 'compute', grantType: 'invoice' }],
          '1',
        );
        let planGrants = await getPlanGrantsForCourseInstance({
          institution_id: '1',
          course_instance_id: '1',
        });
        assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'invoice'));

        await reconcilePlanGrantsForCourseInstance(
          '1',
          [{ plan: 'compute', grantType: 'gift' }],
          '1',
        );
        planGrants = await getPlanGrantsForCourseInstance({
          institution_id: '1',
          course_instance_id: '1',
        });
        assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'gift'));

        await reconcilePlanGrantsForCourseInstance('1', [], '1');
        planGrants = await getPlanGrantsForCourseInstance({
          institution_id: '1',
          course_instance_id: '1',
        });
        assert.deepEqual(planGrants, []);
      });
    });

    it('does not modify institution plan grants', async () => {
      await runInTransactionAndRollback(async () => {
        // Manually insert an institution plan grant.
        await insertPlanGrant(
          {
            plan_name: 'everything',
            type: 'gift',
            institution_id: '1',
          },
          '1',
        );

        await reconcilePlanGrantsForCourseInstance(
          '1',
          [{ plan: 'compute', grantType: 'invoice' }],
          '1',
        );

        const institutionPlanGrants = await getPlanGrantsForContext({ institution_id: '1' });
        assert.lengthOf(institutionPlanGrants, 1);
        assert.equal(institutionPlanGrants[0].plan_name, 'everything');
      });
    });
  });

  describe('updateRequiredPlansForCourseInstance', () => {
    it('persists updates', async () => {
      await runInTransactionAndRollback(async () => {
        await updateRequiredPlansForCourseInstance('1', ['compute'], '1');
        let requiredPlans = await getRequiredPlansForCourseInstance('1');
        assert.deepEqual(requiredPlans, ['compute']);

        await updateRequiredPlansForCourseInstance('1', [], '1');
        requiredPlans = await getRequiredPlansForCourseInstance('1');
        assert.deepEqual(requiredPlans, []);
      });
    });
  });

  describe('getPlanGrantsForCourseInstance', () => {
    it('only returns plan grants directly associated with the course instance', async () => {
      await runInTransactionAndRollback(async () => {
        // Institution plan grant
        await insertPlanGrant(
          {
            plan_name: 'everything',
            type: 'gift',
            institution_id: '1',
          },
          '1',
        );

        // Course instance plan grant
        await insertPlanGrant(
          {
            plan_name: 'compute',
            type: 'invoice',
            institution_id: '1',
            course_instance_id: '1',
          },
          '1',
        );

        // Enrollment plan grant
        await insertEnrollment({ course_instance_id: '1', user_id: '1' });
        await insertPlanGrant(
          {
            plan_name: 'basic',
            type: 'stripe',
            institution_id: '1',
            course_instance_id: '1',
            enrollment_id: '1',
          },
          '1',
        );

        const planGrants = await getPlanGrantsForCourseInstance({
          institution_id: '1',
          course_instance_id: '1',
        });
        assert.lengthOf(planGrants, 1);
        assert.equal(planGrants[0].plan_name, 'compute');
      });
    });
  });

  describe('getPlanGrantsForContext', () => {
    it('returns institution plan grants', async () => {
      await runInTransactionAndRollback(async () => {
        await insertPlanGrant({ plan_name: 'compute', type: 'invoice', institution_id: '1' }, '1');

        const planGrants = await getPlanGrantsForContext({ institution_id: '1' });
        const grantedPlans = getPlanNamesFromPlanGrants(planGrants);
        assert.deepEqual(grantedPlans, ['compute']);

        const recursivePlanGrants = await getPlanGrantsForContextRecursive({ institution_id: '1' });
        const recursiveGrantedPlans = getPlanNamesFromPlanGrants(recursivePlanGrants);
        assert.deepEqual(recursiveGrantedPlans, ['compute']);
      });
    });

    it('returns course instance plan grants', async () => {
      await runInTransactionAndRollback(async () => {
        await insertPlanGrant(
          {
            plan_name: 'basic',
            type: 'invoice',
            institution_id: '1',
          },
          '1',
        );
        await insertPlanGrant(
          {
            plan_name: 'compute',
            type: 'gift',
            institution_id: '1',
            course_instance_id: '1',
          },
          '1',
        );

        const planGrants = await getPlanGrantsForContext({
          institution_id: '1',
          course_instance_id: '1',
        });
        const grantedPlans = getPlanNamesFromPlanGrants(planGrants);
        assert.deepEqual(grantedPlans, ['compute']);

        const recursivePlanGrants = await getPlanGrantsForContextRecursive({
          institution_id: '1',
          course_instance_id: '1',
        });
        const recursiveGrantedPlans = getPlanNamesFromPlanGrants(recursivePlanGrants);
        assert.deepEqual(recursiveGrantedPlans, ['basic', 'compute']);
      });
    });

    it('returns enrollment plan grants', async () => {
      await runInTransactionAndRollback(async () => {
        const enrollment = await insertEnrollment({ course_instance_id: '1', user_id: '1' });

        await insertPlanGrant(
          {
            plan_name: 'basic',
            type: 'invoice',
            institution_id: '1',
          },
          '1',
        );
        await insertPlanGrant(
          {
            plan_name: 'compute',
            type: 'gift',
            institution_id: '1',
            course_instance_id: '1',
          },
          '1',
        );
        await insertPlanGrant(
          {
            plan_name: 'everything',
            type: 'stripe',
            institution_id: '1',
            course_instance_id: '1',
            enrollment_id: enrollment.id,
          },
          '1',
        );

        const planGrants = await getPlanGrantsForContext({
          institution_id: '1',
          course_instance_id: '1',
          enrollment_id: enrollment.id,
        });
        const grantedPlans = getPlanNamesFromPlanGrants(planGrants);
        assert.deepEqual(grantedPlans, ['everything']);

        const recursivePlanGrants = await getPlanGrantsForContextRecursive({
          institution_id: '1',
          course_instance_id: '1',
          enrollment_id: enrollment.id,
        });
        const recursiveGrantedPlans = getPlanNamesFromPlanGrants(recursivePlanGrants);
        assert.deepEqual(recursiveGrantedPlans, ['basic', 'compute', 'everything']);
      });
    });
  });
});
