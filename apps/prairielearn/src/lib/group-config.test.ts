import { assert, describe, it } from 'vitest';

import {
  type AssessmentJson,
  type AssessmentJsonInput,
  AssessmentJsonSchema,
  GroupsJsonSchema,
} from '../schemas/infoAssessment.js';

import {
  cascadeRoleRenamesToZones,
  convertLegacyGroupsToGroupsConfig,
  normalizeGroupSettings,
  serializeGroupSettings,
  stripLegacyGroupKeys,
} from './group-config.js';

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
        groups: {},
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
        groups: { minMembers: 2, maxMembers: 6 },
      } as unknown as AssessmentJsonInput);

      assert.equal(result?.minMembers, 2);
      assert.equal(result?.maxMembers, 6);
    });

    it('normalizes roles with rolePermissions', () => {
      const result = normalizeGroupSettings({
        groups: {
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
    it('normalizes a minimal legacy config using legacy schema defaults', () => {
      const result = normalizeGroupSettings({
        groupWork: true,
      } as unknown as AssessmentJsonInput);

      assert.deepEqual(result, {
        studentPermissions: {
          canCreateGroup: false,
          canJoinGroup: false,
          canLeaveGroup: false,
          canNameGroup: false,
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

describe('serializeGroupSettings', () => {
  const baseFormValues = {
    studentPermissions: {
      canCreateGroup: true,
      canJoinGroup: true,
      canLeaveGroup: true,
      canNameGroup: true,
    },
    minMembers: null,
    maxMembers: null,
    roles: [],
  };

  it('produces a schema-valid block for a minimal config', () => {
    const result = serializeGroupSettings(baseFormValues);
    assert.doesNotThrow(() => GroupsJsonSchema.parse(result));
  });

  it('omits rolePermissions entirely when no roles are configured', () => {
    const result = serializeGroupSettings(baseFormValues);
    assert.isUndefined(result.rolePermissions);
  });

  it('omits rolePermissions when all role permissions are at defaults', () => {
    const result = serializeGroupSettings({
      ...baseFormValues,
      roles: [
        {
          name: 'Worker',
          origName: 'Worker',
          minAssignees: null,
          maxAssignees: null,
          canAssignRoles: false,
          canView: true,
          canSubmit: true,
        },
      ],
    });
    assert.isUndefined(result.rolePermissions);
  });

  it('omits canView/canSubmit from rolePermissions when all roles are permitted', () => {
    const result = serializeGroupSettings({
      ...baseFormValues,
      roles: [
        {
          name: 'Manager',
          origName: 'Manager',
          minAssignees: 1,
          maxAssignees: 1,
          canAssignRoles: true,
          canView: true,
          canSubmit: true,
        },
      ],
    });
    assert.deepEqual(result.rolePermissions, { canAssignRoles: ['Manager'] });
  });

  it('emits canView/canSubmit only for the subset of roles that have them', () => {
    const result = serializeGroupSettings({
      ...baseFormValues,
      roles: [
        {
          name: 'Manager',
          origName: 'Manager',
          minAssignees: 1,
          maxAssignees: 1,
          canAssignRoles: true,
          canView: true,
          canSubmit: false,
        },
        {
          name: 'Recorder',
          origName: 'Recorder',
          minAssignees: 1,
          maxAssignees: 1,
          canAssignRoles: false,
          canView: true,
          canSubmit: true,
        },
      ],
    });
    assert.deepEqual(result.rolePermissions, {
      canAssignRoles: ['Manager'],
      canSubmit: ['Recorder'],
    });
  });
});

describe('stripLegacyGroupKeys', () => {
  it('removes all legacy group keys and preserves unrelated keys', () => {
    const result = stripLegacyGroupKeys({
      uuid: 'abc',
      type: 'Homework',
      groupWork: true,
      groupMaxSize: 4,
      groupMinSize: 2,
      groupRoles: [{ name: 'Manager' }],
      studentGroupCreate: true,
      studentGroupJoin: true,
      studentGroupLeave: true,
      studentGroupChooseName: true,
      canView: ['Manager'],
      canSubmit: ['Manager'],
      groups: {},
    } as unknown as AssessmentJsonInput);

    assert.deepEqual(result, {
      uuid: 'abc',
      type: 'Homework',
      groups: {},
    } as unknown as AssessmentJsonInput);
  });

  it('is a no-op when no legacy keys are present', () => {
    const input = {
      uuid: 'abc',
      type: 'Homework',
      groups: {},
    } as unknown as AssessmentJsonInput;
    assert.deepEqual(stripLegacyGroupKeys(input), input);
  });
});

describe('convertLegacyGroupsToGroupsConfig', () => {
  it('maps legacy fields onto the new groups config shape', () => {
    const result = convertLegacyGroupsToGroupsConfig({
      groupWork: true,
      groupMinSize: 2,
      groupMaxSize: 4,
      groupRoles: [
        { name: 'Manager', minimum: 1, maximum: 1, canAssignRoles: true },
        { name: 'Recorder', minimum: 1, maximum: 1, canAssignRoles: false },
      ],
      studentGroupCreate: true,
      studentGroupJoin: true,
      studentGroupLeave: false,
      studentGroupChooseName: false,
      canView: ['Manager', 'Recorder'],
      canSubmit: ['Recorder'],
    } as unknown as AssessmentJson);

    assert.deepEqual(result, {
      minMembers: 2,
      maxMembers: 4,
      roles: [
        { name: 'Manager', minMembers: 1, maxMembers: 1 },
        { name: 'Recorder', minMembers: 1, maxMembers: 1 },
      ],
      studentPermissions: {
        canCreateGroup: true,
        canJoinGroup: true,
        canLeaveGroup: false,
        canNameGroup: false,
      },
      rolePermissions: {
        canAssignRoles: ['Manager'],
        canView: ['Manager', 'Recorder'],
        canSubmit: ['Recorder'],
      },
    });
  });
});

describe('legacy → normalize → serialize round-trip', () => {
  it('produces a groups block that parses against the assessment schema', () => {
    const legacyAssessment = {
      uuid: '11111111-1111-1111-1111-111111111111',
      type: 'Homework',
      title: 'Legacy group HW',
      set: 'Homework',
      number: '1',
      groupWork: true,
      groupMinSize: 2,
      groupMaxSize: 4,
      groupRoles: [
        { name: 'Manager', minimum: 1, maximum: 1, canAssignRoles: true },
        { name: 'Recorder', minimum: 1, maximum: 1 },
      ],
      studentGroupCreate: true,
      studentGroupJoin: true,
      studentGroupLeave: true,
      studentGroupChooseName: true,
      canView: ['Manager', 'Recorder'],
      canSubmit: ['Recorder'],
    } as unknown as AssessmentJsonInput;

    const normalized = normalizeGroupSettings(legacyAssessment);
    assert.isNotNull(normalized);

    const serialized = serializeGroupSettings(normalized);
    const stripped = stripLegacyGroupKeys({ ...legacyAssessment, groups: serialized });

    const parsed = AssessmentJsonSchema.parse(stripped);
    assert.equal(parsed.groups?.minMembers, 2);
    assert.equal(parsed.groups?.maxMembers, 4);
    assert.deepEqual(
      parsed.groups?.roles.map((r) => r.name),
      ['Manager', 'Recorder'],
    );
    assert.deepEqual(parsed.groups?.rolePermissions.canAssignRoles, ['Manager']);
    assert.deepEqual(parsed.groups?.rolePermissions.canSubmit, ['Recorder']);

    // No legacy keys should remain on the assessment.
    for (const key of [
      'groupWork',
      'groupMinSize',
      'groupMaxSize',
      'groupRoles',
      'studentGroupCreate',
      'studentGroupJoin',
      'studentGroupLeave',
      'studentGroupChooseName',
      'canView',
      'canSubmit',
    ]) {
      assert.notProperty(stripped, key);
    }
  });
});
