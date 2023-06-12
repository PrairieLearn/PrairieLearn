import { assert } from 'chai';

import { instructorInstanceAdminBillingState } from './InstructorInstanceAdminBillingForm.html';

describe('instructorInstanceAdminBillingState', () => {
  it('allows enabling student billing by default', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: [],
      requiredPlans: [],
      institutionPlanGrants: [],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
    });
    assert.equal(state.studentBillingEnabled, false);
    assert.equal(state.studentBillingCanChange, true);
    assert.equal(state.computeEnabled, false);
    assert.equal(state.computeCanChange, true);
  });

  it('disallows enabling compute when already granted by institution', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: [],
      requiredPlans: [],
      institutionPlanGrants: ['compute'],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
    });
    assert.equal(state.computeEnabled, true);
    assert.equal(state.computeCanChange, false);
  });

  it('disallows enabling compute when already granted by course instance', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: [],
      requiredPlans: [],
      institutionPlanGrants: [],
      courseInstancePlanGrants: ['compute'],
      enrollmentCount: 0,
      enrollmentLimit: 0,
    });
    assert.equal(state.computeEnabled, true);
    assert.equal(state.computeCanChange, false);
  });

  it('allows enabling compute when student billing is enabled', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: ['basic'],
      requiredPlans: ['basic'],
      institutionPlanGrants: [],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
    });
    assert.equal(state.computeEnabled, false);
    assert.equal(state.computeCanChange, true);
  });

  it('allows enabling compute when student billing is enabled and compute is granted by institution', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: ['basic'],
      requiredPlans: ['basic'],
      institutionPlanGrants: ['compute'],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
    });
    assert.equal(state.computeEnabled, false);
    assert.equal(state.computeCanChange, true);
  });

  it('allows enabling compute when student billing is enabled and compute is granted by course instance', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: ['basic'],
      requiredPlans: ['basic'],
      institutionPlanGrants: [],
      courseInstancePlanGrants: ['compute'],
      enrollmentCount: 0,
      enrollmentLimit: 0,
    });
    assert.equal(state.computeEnabled, false);
    assert.equal(state.computeCanChange, true);
  });

  it('warns when disabling student billing with excess enrollments', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: ['basic'],
      requiredPlans: [],
      institutionPlanGrants: [],
      courseInstancePlanGrants: [],
      enrollmentCount: 100,
      enrollmentLimit: 50,
    });
    assert.match(
      state.alertMessage ?? '',
      /will forbid students from accessing this course instance/
    );
  });
});
