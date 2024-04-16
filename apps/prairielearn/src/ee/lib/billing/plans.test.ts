import { assert } from 'chai';

import * as helperServer from '../../../tests/helperServer';
import * as helperDb from '../../../tests/helperDb';
import {
  getPlanGrantsForContext,
  getPlanGrantsForPartialContexts,
  getPlanGrantsForCourseInstance,
  getPlanNamesFromPlanGrants,
  getRequiredPlansForCourseInstance,
  reconcilePlanGrantsForCourseInstance,
  reconcilePlanGrantsForInstitution,
  updateRequiredPlansForCourseInstance,
} from './plans';
import { ensurePlanGrant } from '../../models/plan-grants';

describe('plans', () => {
  before(helperServer.before());
  after(helperServer.after);

  describe('reconcilePlanGrantsForInstitution', () => {
    it('persists updates', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
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
        assert.sameDeepMembers(planGrants, []);
      });
    });
  });

  describe('reconcilePlanGrantsForCourseInstance', () => {
    it('persists updates', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
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
        assert.sameDeepMembers(planGrants, []);
      });
    });

    it('does not modify institution plan grants', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        // Manually insert an institution plan grant.
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'everything',
            type: 'gift',
            institution_id: '1',
          },
          authn_user_id: '1',
        });

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
      await helperDb.runInTransactionAndRollback(async () => {
        await updateRequiredPlansForCourseInstance('1', ['compute'], '1');
        let requiredPlans = await getRequiredPlansForCourseInstance('1');
        assert.sameDeepMembers(requiredPlans, ['compute']);

        await updateRequiredPlansForCourseInstance('1', [], '1');
        requiredPlans = await getRequiredPlansForCourseInstance('1');
        assert.sameDeepMembers(requiredPlans, []);
      });
    });
  });

  describe('getPlanGrantsForCourseInstance', () => {
    it('only returns plan grants directly associated with the course instance', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        // Institution plan grant
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'everything',
            type: 'gift',
            institution_id: '1',
          },
          authn_user_id: '1',
        });

        // Course instance plan grant
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'compute',
            type: 'invoice',
            institution_id: '1',
            course_instance_id: '1',
          },
          authn_user_id: '1',
        });

        // Course instance user plan grant
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'basic',
            type: 'stripe',
            institution_id: '1',
            course_instance_id: '1',
            user_id: '1',
          },
          authn_user_id: '1',
        });

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
      await helperDb.runInTransactionAndRollback(async () => {
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'compute',
            type: 'invoice',
            institution_id: '1',
          },
          authn_user_id: '1',
        });

        const planGrants = await getPlanGrantsForContext({ institution_id: '1' });
        const grantedPlans = getPlanNamesFromPlanGrants(planGrants);
        assert.sameDeepMembers(grantedPlans, ['compute']);

        const allPlanGrants = await getPlanGrantsForPartialContexts({ institution_id: '1' });
        const recursiveGrantedPlans = getPlanNamesFromPlanGrants(allPlanGrants);
        assert.sameDeepMembers(recursiveGrantedPlans, ['compute']);
      });
    });

    it('returns course instance plan grants', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'basic',
            type: 'invoice',
            institution_id: '1',
          },
          authn_user_id: '1',
        });
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'compute',
            type: 'gift',
            institution_id: '1',
            course_instance_id: '1',
          },
          authn_user_id: '1',
        });

        const planGrants = await getPlanGrantsForContext({
          institution_id: '1',
          course_instance_id: '1',
        });
        const grantedPlans = getPlanNamesFromPlanGrants(planGrants);
        assert.sameDeepMembers(grantedPlans, ['compute']);

        const allPlanGrants = await getPlanGrantsForPartialContexts({
          institution_id: '1',
          course_instance_id: '1',
        });
        const recursiveGrantedPlans = getPlanNamesFromPlanGrants(allPlanGrants);
        assert.sameDeepMembers(recursiveGrantedPlans, ['basic', 'compute']);
      });
    });

    it('returns course instance user plan grants', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'basic',
            type: 'invoice',
            institution_id: '1',
          },
          authn_user_id: '1',
        });
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'compute',
            type: 'gift',
            institution_id: '1',
            course_instance_id: '1',
          },
          authn_user_id: '1',
        });
        await ensurePlanGrant({
          plan_grant: {
            plan_name: 'everything',
            type: 'stripe',
            institution_id: '1',
            course_instance_id: '1',
            user_id: '1',
          },
          authn_user_id: '1',
        });

        const planGrants = await getPlanGrantsForContext({
          institution_id: '1',
          course_instance_id: '1',
          user_id: '1',
        });
        const grantedPlans = getPlanNamesFromPlanGrants(planGrants);
        assert.sameDeepMembers(grantedPlans, ['everything']);

        const allPlanGrants = await getPlanGrantsForPartialContexts({
          institution_id: '1',
          course_instance_id: '1',
          user_id: '1',
        });
        const recursiveGrantedPlans = getPlanNamesFromPlanGrants(allPlanGrants);
        assert.sameDeepMembers(recursiveGrantedPlans, ['basic', 'compute', 'everything']);
      });
    });
  });
});
