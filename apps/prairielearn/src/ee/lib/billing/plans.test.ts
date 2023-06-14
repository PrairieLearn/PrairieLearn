import { assert } from 'chai';

import helperServer = require('../../../tests/helperServer');
import {
  getPlanGrantsForCourseInstance,
  getPlanGrantsForInstitution,
  getRequiredPlansForCourseInstance,
  updatePlanGrantsForCourseInstance,
  updatePlanGrantsForInstitution,
  updateRequiredPlansForCourseInstance,
} from './plans';

describe('plans', () => {
  before(helperServer.before());
  after(helperServer.after);

  it('persists plan grants for an institution', async () => {
    await updatePlanGrantsForInstitution('1', [{ plan: 'compute', grantType: 'invoice' }]);
    let planGrants = await getPlanGrantsForInstitution('1');
    assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'invoice'));

    await updatePlanGrantsForInstitution('1', [{ plan: 'compute', grantType: 'gift' }]);
    planGrants = await getPlanGrantsForInstitution('1');
    assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'gift'));

    await updatePlanGrantsForInstitution('1', []);
    planGrants = await getPlanGrantsForInstitution('1');
    assert.deepEqual(planGrants, []);
  });

  it('persists plan grants for a course instance', async () => {
    await updatePlanGrantsForCourseInstance('1', [{ plan: 'compute', grantType: 'invoice' }]);
    let planGrants = await getPlanGrantsForCourseInstance('1');
    assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'invoice'));

    await updatePlanGrantsForCourseInstance('1', [{ plan: 'compute', grantType: 'gift' }]);
    planGrants = await getPlanGrantsForCourseInstance('1');
    assert.isOk(planGrants.find((pg) => pg.plan_name === 'compute' && pg.type === 'gift'));

    await updatePlanGrantsForCourseInstance('1', []);
    planGrants = await getPlanGrantsForCourseInstance('1');
    assert.deepEqual(planGrants, []);
  });

  it('persists required plans for a course instance', async () => {
    await updateRequiredPlansForCourseInstance('1', ['compute']);
    let requiredPlans = await getRequiredPlansForCourseInstance('1');
    assert.deepEqual(requiredPlans, ['compute']);

    await updateRequiredPlansForCourseInstance('1', []);
    requiredPlans = await getRequiredPlansForCourseInstance('1');
    assert.deepEqual(requiredPlans, []);
  });
});
