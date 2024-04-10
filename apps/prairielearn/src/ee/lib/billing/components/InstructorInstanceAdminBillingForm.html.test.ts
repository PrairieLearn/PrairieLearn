import { assert } from 'chai';

import { instructorInstanceAdminBillingState } from './InstructorInstanceAdminBillingForm.html';

describe('instructorInstanceAdminBillingState', () => {
  it('allows enabling student billing by default', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: [],
      desiredRequiredPlans: [],
      institutionPlanGrants: [],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
      editable: true,
    });
    assert.isFalse(state.studentBillingEnabled);
    assert.isTrue(state.studentBillingCanChange);
    assert.isFalse(state.computeEnabled);
    assert.isTrue(state.computeCanChange);
  });

  it('disallows enabling compute when already granted by institution', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: [],
      desiredRequiredPlans: [],
      institutionPlanGrants: ['compute'],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
      editable: true,
    });
    assert.isTrue(state.computeEnabled);
    assert.isFalse(state.computeCanChange);
  });

  it('disallows enabling compute when already granted by course instance', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: [],
      desiredRequiredPlans: [],
      institutionPlanGrants: [],
      courseInstancePlanGrants: ['compute'],
      enrollmentCount: 0,
      enrollmentLimit: 0,
      editable: true,
    });
    assert.isTrue(state.computeEnabled);
    assert.isFalse(state.computeCanChange);
  });

  it('allows enabling compute when student billing is enabled', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: ['basic'],
      desiredRequiredPlans: ['basic'],
      institutionPlanGrants: [],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
      editable: true,
    });
    assert.isFalse(state.computeEnabled);
    assert.isTrue(state.computeCanChange);
  });

  it('allows enabling compute when student billing is enabled and compute is granted by institution', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: ['basic'],
      desiredRequiredPlans: ['basic'],
      institutionPlanGrants: ['compute'],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
      editable: true,
    });
    assert.isFalse(state.computeEnabled);
    assert.isTrue(state.computeCanChange);
  });

  it('allows enabling compute when student billing is enabled and compute is granted by course instance', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: ['basic'],
      desiredRequiredPlans: ['basic'],
      institutionPlanGrants: [],
      courseInstancePlanGrants: ['compute'],
      enrollmentCount: 0,
      enrollmentLimit: 0,
      editable: true,
    });
    assert.isFalse(state.computeEnabled);
    assert.isTrue(state.computeCanChange);
  });

  it('warns when disabling student billing with excess enrollments', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: ['basic'],
      desiredRequiredPlans: [],
      institutionPlanGrants: [],
      courseInstancePlanGrants: [],
      enrollmentCount: 100,
      enrollmentLimit: 50,
      editable: true,
    });
    assert.isFalse(state.studentBillingCanChange);
    assert.isTrue(state.studentBillingDidChange);
    assert.match(
      state.studentBillingAlert?.message ?? '',
      /To disable student billing, first remove excess enrollments./,
    );
  });

  it('disallows changes when editing is disabled', () => {
    const state = instructorInstanceAdminBillingState({
      initialRequiredPlans: [],
      desiredRequiredPlans: [],
      institutionPlanGrants: [],
      courseInstancePlanGrants: [],
      enrollmentCount: 0,
      enrollmentLimit: 0,
      editable: false,
    });
    assert.isFalse(state.studentBillingCanChange);
    assert.isFalse(state.computeCanChange);
  });
});
