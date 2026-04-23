import type { AssessmentJsonInput, GroupsJsonInput } from '../schemas/infoAssessment.js';

const LEGACY_GROUP_KEYS = [
  'groupWork',
  'groupMaxSize',
  'groupMinSize',
  'groupRoles',
  'studentGroupCreate',
  'studentGroupJoin',
  'studentGroupLeave',
  'studentGroupChooseName',
  'canView',
  'canSubmit',
] as const satisfies readonly (keyof AssessmentJsonInput)[];

export function stripLegacyGroupKeys(json: AssessmentJsonInput): void {
  for (const key of LEGACY_GROUP_KEYS) {
    delete json[key];
  }
}

export function serializeGroupSettings(
  settings: GroupSettingsFormValues,
  { enabled }: { enabled: boolean },
): GroupsJsonInput {
  const roles = settings.roles;
  const canAssignRoles = roles.filter((r) => r.canAssignRoles).map((r) => r.name);
  const canView = roles.filter((r) => r.canView).map((r) => r.name);
  const canSubmit = roles.filter((r) => r.canSubmit).map((r) => r.name);

  return {
    enabled,
    minMembers: settings.minMembers ?? undefined,
    maxMembers: settings.maxMembers ?? undefined,
    studentPermissions: {
      canCreateGroup: settings.studentPermissions.canCreateGroup,
      canJoinGroup: settings.studentPermissions.canJoinGroup,
      canLeaveGroup: settings.studentPermissions.canLeaveGroup,
      canNameGroup: settings.studentPermissions.canNameGroup,
    },
    roles: roles.map(({ name, maxAssignees, minAssignees }) => ({
      name,
      minMembers: minAssignees ?? undefined,
      maxMembers: maxAssignees ?? undefined,
    })),
    rolePermissions: {
      ...(canAssignRoles.length > 0 ? { canAssignRoles } : {}),
      ...(canView.length < roles.length ? { canView } : {}),
      ...(canSubmit.length < roles.length ? { canSubmit } : {}),
    },
  };
}

export interface GroupSettingsFormValues {
  studentPermissions: {
    canCreateGroup: boolean;
    canJoinGroup: boolean;
    canLeaveGroup: boolean;
    canNameGroup: boolean;
  };
  minMembers: number | null;
  maxMembers: number | null;
  roles: {
    name: string;
    origName: string | null;
    minAssignees: number | null;
    maxAssignees: number | null;
    canAssignRoles: boolean;
    canView: boolean;
    canSubmit: boolean;
  }[];
}

type GroupSettingsRole = GroupSettingsFormValues['roles'][number];

/**
 * Builds a role with the given overrides merged over sensible defaults.
 * Used both when creating new roles from the UI and when seeding the
 * recommended-roles configuration.
 */
export function makeRole(overrides: Partial<GroupSettingsRole> = {}): GroupSettingsRole {
  return {
    name: '',
    origName: null,
    minAssignees: null,
    maxAssignees: null,
    canAssignRoles: false,
    canView: true,
    canSubmit: true,
    ...overrides,
  };
}

/**
 * Rewrites role references in an assessment's zone and question `canView` /
 * `canSubmit` arrays based on role renames and deletions.
 *
 * For each submitted role, an `origName` that differs from `name` is treated
 * as a rename and all matching references are updated. References to role
 * names not present in the submitted set are filtered out.
 *
 * Mutates `json` in place.
 */
export function cascadeRoleRenamesToZones(
  json: AssessmentJsonInput,
  roles: { name: string; origName: string | null }[],
): void {
  const renameMap = new Map<string, string>();
  for (const role of roles) {
    if (role.origName && role.origName !== role.name) {
      renameMap.set(role.origName, role.name);
    }
  }
  const validNames = new Set(roles.map((r) => r.name));
  const rewrite = (names: string[] | undefined): string[] | undefined => {
    if (!names) return names;
    return names.map((n) => renameMap.get(n) ?? n).filter((n) => validNames.has(n));
  };

  for (const zone of json.zones ?? []) {
    zone.canView = rewrite(zone.canView);
    zone.canSubmit = rewrite(zone.canSubmit);
    for (const q of zone.questions) {
      q.canView = rewrite(q.canView);
      q.canSubmit = rewrite(q.canSubmit);
    }
  }
}

/**
 * Normalizes group configuration from either the new `groups` block or legacy
 * top-level properties into the form-values shape used by the Group Settings UI.
 *
 * Returns `null` when the assessment has no group configuration at all (neither
 * `groups` nor `groupWork: true`).
 *
 * Legacy assessments are read correctly but will be passively migrated to the
 * new format when saved through the UI — the write path always outputs a
 * `groups` block and deletes any legacy keys.
 */
export function normalizeGroupSettings(json: AssessmentJsonInput): GroupSettingsFormValues | null {
  if (json.groups) {
    const rp = json.groups.rolePermissions ?? {};
    return {
      studentPermissions: {
        canCreateGroup: json.groups.studentPermissions?.canCreateGroup ?? false,
        canJoinGroup: json.groups.studentPermissions?.canJoinGroup ?? false,
        canLeaveGroup: json.groups.studentPermissions?.canLeaveGroup ?? false,
        canNameGroup: json.groups.studentPermissions?.canNameGroup ?? true,
      },
      minMembers: json.groups.minMembers ?? null,
      maxMembers: json.groups.maxMembers ?? null,
      roles: (json.groups.roles ?? []).map((role) => ({
        name: role.name,
        origName: role.name,
        minAssignees: role.minMembers ?? null,
        maxAssignees: role.maxMembers ?? null,
        canAssignRoles: rp.canAssignRoles?.includes(role.name) ?? false,
        canView: rp.canView === undefined || rp.canView.includes(role.name),
        canSubmit: rp.canSubmit === undefined || rp.canSubmit.includes(role.name),
      })),
    };
  }

  if (!json.groupWork) return null;

  return {
    studentPermissions: {
      canCreateGroup: json.studentGroupCreate ?? false,
      canJoinGroup: json.studentGroupJoin ?? false,
      canLeaveGroup: json.studentGroupLeave ?? false,
      canNameGroup: json.studentGroupChooseName ?? true,
    },
    minMembers: json.groupMinSize ?? null,
    maxMembers: json.groupMaxSize ?? null,
    roles: (json.groupRoles ?? []).map((role) => ({
      name: role.name,
      origName: role.name,
      minAssignees: role.minimum ?? null,
      maxAssignees: role.maximum ?? null,
      canAssignRoles: role.canAssignRoles ?? false,
      canView:
        json.canView === undefined || json.canView.length === 0 || json.canView.includes(role.name),
      canSubmit:
        json.canSubmit === undefined ||
        json.canSubmit.length === 0 ||
        json.canSubmit.includes(role.name),
    })),
  };
}
