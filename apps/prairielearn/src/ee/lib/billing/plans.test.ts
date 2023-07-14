import { assert } from 'chai';

import helperServer = require('../../../tests/helperServer');
import {
  getPlanGrantsForCourseInstance,
  getPlanGrantsForInstitution,
  getRequiredPlansForCourseInstance,
  reconcilePlanGrantsForCourseInstance,
  reconcilePlanGrantsForInstitution,
  updateRequiredPlansForCourseInstance,
} from './plans';

describe('plans', () => {
  before(helperServer.before());
  after(helperServer.after);

  describe('updatePlanGrantsForInstitution', () => {
    it('persists updates', async () => {
      await reconcilePlanGrantsForInstitution('1', [{ plan: 'compute', grantType: 'invoice' }]);
      let planGrants = await getPlanGrantsForInstitution('1');
      assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'invoice'));

      await reconcilePlanGrantsForInstitution('1', [{ plan: 'compute', grantType: 'gift' }]);
      planGrants = await getPlanGrantsForInstitution('1');
      assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'gift'));

      await reconcilePlanGrantsForInstitution('1', []);
      planGrants = await getPlanGrantsForInstitution('1');
      assert.deepEqual(planGrants, []);
    });
  });

  describe('updatePlanGrantsForCourseInstance', () => {
    it('persists updates', async () => {
      await reconcilePlanGrantsForCourseInstance('1', [{ plan: 'compute', grantType: 'invoice' }]);
      let planGrants = await getPlanGrantsForCourseInstance('1');
      assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'invoice'));

      await reconcilePlanGrantsForCourseInstance('1', [{ plan: 'compute', grantType: 'gift' }]);
      planGrants = await getPlanGrantsForCourseInstance('1');
      assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'gift'));

      await reconcilePlanGrantsForCourseInstance('1', []);
      planGrants = await getPlanGrantsForCourseInstance('1');
      assert.deepEqual(planGrants, []);
    });
  });

  describe('updateRequirePlansForCourseInstance', () => {
    it('persists updates', async () => {
      await updateRequiredPlansForCourseInstance('1', ['compute']);
      let requiredPlans = await getRequiredPlansForCourseInstance('1');
      assert.deepEqual(requiredPlans, ['compute']);

      await updateRequiredPlansForCourseInstance('1', []);
      requiredPlans = await getRequiredPlansForCourseInstance('1');
      assert.deepEqual(requiredPlans, []);
    });
  });
});
