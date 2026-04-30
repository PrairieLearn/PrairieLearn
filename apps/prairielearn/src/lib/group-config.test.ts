import { assert, describe, it } from 'vitest';

import type { AssessmentJsonInput } from '../schemas/infoAssessment.js';

import { cascadeRoleRenamesToZones, normalizeGroupSettings } from './group-config.js';

describe('normalizeGroupSettings', () => {
  describe('returns null for non-group assessments', () => {
    it('returns null when neither groups nor groupWork is set', () => {
      assert.isNull(normalizeGroupSettings({} as unknown as AssessmentJsonInput));
    });

    it('returns null when groupWork is false', () => {
      assert.isNull(normalizeGroupSettings({ groupWork: false } as unknown as AssessmentJsonInput));
    });
  });

  describe('new format (groups block)', () => {
    it('normalizes a minimal groups block', () => {
      const result = normalizeGroupSettings({
        groups: { enabled: true },
      } as unknown as AssessmentJsonInput);

      assert.deepEqual(result, {
        studentPermissions: {
          canCreateGroup: true,
          canJoinGroup: true,
          canLeaveGroup: true,
          canNameGroup: true,
        },
        minMembers: null,
        maxMembers: null,
        roles: [],
      });
    });

    it('forces canNameGroup off when canCreateGroup is off', () => {
      const result = normalizeGroupSettings({
        groups: {
          enabled: true,
          studentPermissions: {
            canCreateGroup: false,
            canNameGroup: true,
          },
        },
      } as unknown as AssessmentJsonInput);

      assert.equal(result?.studentPermissions.canCreateGroup, false);
      assert.equal(result?.studentPermissions.canNameGroup, false);
    });

    it('normalizes studentPermissions', () => {
      const result = normalizeGroupSettings({
        groups: {
          enabled: true,
          studentPermissions: {
            canCreateGroup: true,
            canJoinGroup: true,
            canLeaveGroup: true,
            canNameGroup: false,
          },
        },
      } as unknown as AssessmentJsonInput);

      assert.deepEqual(result?.studentPermissions, {
        canCreateGroup: true,
        canJoinGroup: true,
        canLeaveGroup: true,
        canNameGroup: false,
      });
    });

    it('normalizes minMembers and maxMembers', () => {
      const result = normalizeGroupSettings({
        groups: { enabled: true, minMembers: 2, maxMembers: 6 },
      } as unknown as AssessmentJsonInput);

      assert.equal(result?.minMembers, 2);
      assert.equal(result?.maxMembers, 6);
    });

    it('normalizes roles with rolePermissions', () => {
      const result = normalizeGroupSettings({
        groups: {
          enabled: true,
          roles: [
            { name: 'Manager', minMembers: 1, maxMembers: 1 },
            { name: 'Recorder', minMembers: 1, maxMembers: 1 },
            { name: 'Contributor' },
          ],
          rolePermissions: {
            canAssignRoles: ['Manager'],
            canView: ['Manager', 'Recorder', 'Contributor'],
            canSubmit: ['Recorder'],
          },
        },
      } as unknown as AssessmentJsonInput);

      assert.lengthOf(result!.roles, 3);

      assert.deepEqual(result!.roles[0], {
        name: 'Manager',
        origName: 'Manager',
        minAssignees: 1,
        maxAssignees: 1,
        canAssignRoles: true,
        canView: true,
        canSubmit: false,
      });

      assert.deepEqual(result!.roles[1], {
        name: 'Recorder',
        origName: 'Recorder',
        minAssignees: 1,
        maxAssignees: 1,
        canAssignRoles: false,
        canView: true,
        canSubmit: true,
      });

      assert.deepEqual(result!.roles[2], {
        name: 'Contributor',
        origName: 'Contributor',
        minAssignees: null,
        maxAssignees: null,
        canAssignRoles: false,
        canView: true,
        canSubmit: false,
      });
    });

    it('treats absent canView/canSubmit as all-roles-permitted', () => {
      const result = normalizeGroupSettings({
        groups: {
          enabled: true,
          roles: [{ name: 'Worker' }],
          rolePermissions: {},
        },
      } as unknown as AssessmentJsonInput);

      assert.equal(result!.roles[0].canView, true);
      assert.equal(result!.roles[0].canSubmit, true);
      assert.equal(result!.roles[0].canAssignRoles, false);
    });

    it('treats empty canView/canSubmit arrays as all-roles-permitted (legacy compat)', () => {
      const result = normalizeGroupSettings({
        groups: {
          enabled: true,
          roles: [{ name: 'Worker' }],
          rolePermissions: {
            canView: [] as string[],
            canSubmit: [] as string[],
          },
        },
      } as unknown as AssessmentJsonInput);

      assert.equal(result!.roles[0].canView, true);
      assert.equal(result!.roles[0].canSubmit, true);
    });
  });

  describe('legacy format (groupWork: true)', () => {
    it('normalizes a minimal legacy config', () => {
      const result = normalizeGroupSettings({
        groupWork: true,
      } as unknown as AssessmentJsonInput);

      assert.deepEqual(result, {
        studentPermissions: {
          canCreateGroup: true,
          canJoinGroup: true,
          canLeaveGroup: true,
          canNameGroup: true,
        },
        minMembers: null,
        maxMembers: null,
        roles: [],
      });
    });

    it('normalizes legacy student permissions', () => {
      const result = normalizeGroupSettings({
        groupWork: true,
        studentGroupCreate: true,
        studentGroupJoin: true,
        studentGroupLeave: true,
        studentGroupChooseName: false,
      } as unknown as AssessmentJsonInput);

      assert.deepEqual(result?.studentPermissions, {
        canCreateGroup: true,
        canJoinGroup: true,
        canLeaveGroup: true,
        canNameGroup: false,
      });
    });

    it('normalizes legacy groupMinSize and groupMaxSize', () => {
      const result = normalizeGroupSettings({
        groupWork: true,
        groupMinSize: 3,
        groupMaxSize: 5,
      } as unknown as AssessmentJsonInput);

      assert.equal(result?.minMembers, 3);
      assert.equal(result?.maxMembers, 5);
    });

    it('normalizes legacy groupRoles with canAssignRoles pivot', () => {
      const result = normalizeGroupSettings({
        groupWork: true,
        groupRoles: [
          { name: 'Manager', minimum: 1, maximum: 1, canAssignRoles: true },
          { name: 'Recorder', minimum: 1, maximum: 1, canAssignRoles: false },
          { name: 'Contributor' },
        ],
        canView: ['Manager', 'Recorder', 'Contributor'],
        canSubmit: ['Recorder'],
      } as unknown as AssessmentJsonInput);

      assert.lengthOf(result!.roles, 3);

      assert.deepEqual(result!.roles[0], {
        name: 'Manager',
        origName: 'Manager',
        minAssignees: 1,
        maxAssignees: 1,
        canAssignRoles: true,
        canView: true,
        canSubmit: false,
      });

      assert.deepEqual(result!.roles[1], {
        name: 'Recorder',
        origName: 'Recorder',
        minAssignees: 1,
        maxAssignees: 1,
        canAssignRoles: false,
        canView: true,
        canSubmit: true,
      });

      assert.deepEqual(result!.roles[2], {
        name: 'Contributor',
        origName: 'Contributor',
        minAssignees: null,
        maxAssignees: null,
        canAssignRoles: false,
        canView: true,
        canSubmit: false,
      });
    });

    it('treats absent legacy canView/canSubmit as all-roles-permitted', () => {
      const result = normalizeGroupSettings({
        groupWork: true,
        groupRoles: [{ name: 'Worker' }],
      } as unknown as AssessmentJsonInput);

      assert.equal(result!.roles[0].canView, true);
      assert.equal(result!.roles[0].canSubmit, true);
    });

    it('treats empty legacy canView/canSubmit as all-roles-permitted', () => {
      const result = normalizeGroupSettings({
        groupWork: true,
        groupRoles: [{ name: 'Worker' }],
        canView: [],
        canSubmit: [],
      } as unknown as AssessmentJsonInput);

      assert.equal(result!.roles[0].canView, true);
      assert.equal(result!.roles[0].canSubmit, true);
    });
  });
});

describe('cascadeRoleRenamesToZones', () => {
  const makeJson = (
    zones: {
      canView?: string[];
      canSubmit?: string[];
      questions: { canView?: string[]; canSubmit?: string[] }[];
    }[],
  ): AssessmentJsonInput => ({ zones }) as unknown as AssessmentJsonInput;

  it('renames role references in zone canView/canSubmit', () => {
    const json = makeJson([
      {
        canView: ['Manager', 'Recorder'],
        canSubmit: ['Recorder'],
        questions: [],
      },
    ]);
    cascadeRoleRenamesToZones(json, [
      { name: 'Team Lead', origName: 'Manager' },
      { name: 'Recorder', origName: 'Recorder' },
    ]);
    assert.deepEqual(json.zones![0].canView, ['Team Lead', 'Recorder']);
    assert.deepEqual(json.zones![0].canSubmit, ['Recorder']);
  });

  it('renames role references in question canView/canSubmit', () => {
    const json = makeJson([
      {
        questions: [
          { canView: ['Manager'], canSubmit: ['Recorder'] },
          { canView: ['Manager', 'Recorder'] },
        ],
      },
    ]);
    cascadeRoleRenamesToZones(json, [
      { name: 'Team Lead', origName: 'Manager' },
      { name: 'Recorder', origName: 'Recorder' },
    ]);
    assert.deepEqual(json.zones![0].questions[0].canView, ['Team Lead']);
    assert.deepEqual(json.zones![0].questions[0].canSubmit, ['Recorder']);
    assert.deepEqual(json.zones![0].questions[1].canView, ['Team Lead', 'Recorder']);
  });

  it('removes references to deleted roles', () => {
    const json = makeJson([
      {
        canView: ['Manager', 'DeletedRole'],
        canSubmit: ['DeletedRole'],
        questions: [{ canView: ['Manager', 'DeletedRole'] }],
      },
    ]);
    cascadeRoleRenamesToZones(json, [{ name: 'Manager', origName: 'Manager' }]);
    assert.deepEqual(json.zones![0].canView, ['Manager']);
    assert.deepEqual(json.zones![0].canSubmit, []);
    assert.deepEqual(json.zones![0].questions[0].canView, ['Manager']);
  });

  it('treats null origName (new role) as having no rename', () => {
    const json = makeJson([{ canView: ['Manager'], questions: [] }]);
    cascadeRoleRenamesToZones(json, [
      { name: 'Manager', origName: 'Manager' },
      { name: 'NewRole', origName: null },
    ]);
    assert.deepEqual(json.zones![0].canView, ['Manager']);
  });

  it('treats empty-string origName as having no rename', () => {
    const json = makeJson([{ canView: ['Manager'], questions: [] }]);
    cascadeRoleRenamesToZones(json, [
      { name: 'Manager', origName: 'Manager' },
      { name: 'NewRole', origName: '' },
    ]);
    assert.deepEqual(json.zones![0].canView, ['Manager']);
  });

  it('leaves undefined arrays as undefined', () => {
    const json = makeJson([{ questions: [{}] }]);
    cascadeRoleRenamesToZones(json, [{ name: 'Manager', origName: 'Manager' }]);
    assert.isUndefined(json.zones![0].canView);
    assert.isUndefined(json.zones![0].canSubmit);
    assert.isUndefined(json.zones![0].questions[0].canView);
  });

  it('no-ops when origName matches name', () => {
    const json = makeJson([
      {
        canView: ['Manager', 'Recorder'],
        questions: [{ canView: ['Recorder'] }],
      },
    ]);
    cascadeRoleRenamesToZones(json, [
      { name: 'Manager', origName: 'Manager' },
      { name: 'Recorder', origName: 'Recorder' },
    ]);
    assert.deepEqual(json.zones![0].canView, ['Manager', 'Recorder']);
    assert.deepEqual(json.zones![0].questions[0].canView, ['Recorder']);
  });

  it('handles a role that was deleted, combined with a rename', () => {
    const json = makeJson([
      {
        canView: ['Manager', 'Recorder', 'OldName'],
        questions: [{ canSubmit: ['OldName', 'Manager'] }],
      },
    ]);
    cascadeRoleRenamesToZones(json, [
      { name: 'Team Lead', origName: 'Manager' },
      { name: 'Recorder', origName: 'Recorder' },
    ]);
    assert.deepEqual(json.zones![0].canView, ['Team Lead', 'Recorder']);
    assert.deepEqual(json.zones![0].questions[0].canSubmit, ['Team Lead']);
  });

  it('does nothing when json has no zones', () => {
    const json: AssessmentJsonInput = {} as unknown as AssessmentJsonInput;
    cascadeRoleRenamesToZones(json, [{ name: 'Manager', origName: 'Manager' }]);
    assert.isUndefined(json.zones);
  });

  it('keeps references when a rename recycles the old name for a new role', () => {
    const json = makeJson([
      {
        canView: ['Manager', 'Recorder'],
        questions: [{ canSubmit: ['Manager'] }],
      },
    ]);
    cascadeRoleRenamesToZones(json, [
      { name: 'Lead', origName: 'Manager' },
      { name: 'Manager', origName: null },
      { name: 'Recorder', origName: 'Recorder' },
    ]);
    assert.deepEqual(json.zones![0].canView, ['Manager', 'Recorder']);
    assert.deepEqual(json.zones![0].questions[0].canSubmit, ['Manager']);
  });
});
