import type {
  AssessmentJson,
  AssessmentJsonInput,
  GroupsJson,
  GroupsJsonInput,
} from '../schemas/infoAssessment.js';

const LEGACY_GROUP_KEYS = new Set<keyof AssessmentJsonInput>([
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
]);

export function stripLegacyGroupKeys(json: AssessmentJsonInput): AssessmentJsonInput {
  return Object.fromEntries(
    Object.entries(json).filter(
      ([key]) => !LEGACY_GROUP_KEYS.has(key as keyof AssessmentJsonInput),
    ),
  ) as AssessmentJsonInput;
}

/**
 * Converts legacy top-level group properties on an assessment into the unified
 * `groups` config shape. Used by sync code so downstream logic only has to
 * handle one representation regardless of how the assessment was authored.
 */
export function convertLegacyGroupsToGroupsConfig(assessment: AssessmentJson): GroupsJson {
  const canAssignRoles = assessment.groupRoles
    .filter((role) => role.canAssignRoles)
    .map((role) => role.name);

  return {
    minMembers: assessment.groupMinSize,
    maxMembers: assessment.groupMaxSize,
    roles: assessment.groupRoles.map((role) => ({
      name: role.name,
      minMembers: role.minimum,
      maxMembers: role.maximum,
    })),
    studentPermissions: {
      canCreateGroup: assessment.studentGroupCreate,
      canJoinGroup: assessment.studentGroupJoin,
      canLeaveGroup: assessment.studentGroupLeave,
      canNameGroup: assessment.studentGroupChooseName,
    },
    rolePermissions: {
      canAssignRoles,
      canView: assessment.canView,
      canSubmit: assessment.canSubmit,
    },
  };
}

export function serializeGroupSettings(settings: GroupSettingsFormValues): GroupsJsonInput {
  const roles = settings.roles;
  const canAssignRoles = roles.filter((r) => r.canAssignRoles).map((r) => r.name);
  const canView = roles.filter((r) => r.canView).map((r) => r.name);
  const canSubmit = roles.filter((r) => r.canSubmit).map((r) => r.name);

  const rolePermissions: NonNullable<GroupsJsonInput['rolePermissions']> = {
    ...(canAssignRoles.length > 0 ? { canAssignRoles } : {}),
    ...(canView.length < roles.length ? { canView } : {}),
    ...(canSubmit.length < roles.length ? { canSubmit } : {}),
  };

  return {
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
    rolePermissions: Object.keys(rolePermissions).length > 0 ? rolePermissions : undefined,
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
  const currentNames = new Set(roles.map((r) => r.name));
  const renameMap = new Map<string, string>();
  for (const role of roles) {
    // If the old name is reused by another role in the same submission (e.g.
    // renaming "Manager" → "Lead" while adding a new "Manager"), leave existing
    // references pointing to that name alone so they resolve to the new role.
    if (role.origName && role.origName !== role.name && !currentNames.has(role.origName)) {
      renameMap.set(role.origName, role.name);
    }
  }
  const validNames = currentNames;
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
        canCreateGroup: json.groups.studentPermissions?.canCreateGroup ?? true,
        canJoinGroup: json.groups.studentPermissions?.canJoinGroup ?? true,
        canLeaveGroup: json.groups.studentPermissions?.canLeaveGroup ?? true,
        canNameGroup:
          (json.groups.studentPermissions?.canCreateGroup ?? true) &&
          (json.groups.studentPermissions?.canNameGroup ?? true),
      },
      minMembers: json.groups.minMembers ?? null,
      maxMembers: json.groups.maxMembers ?? null,
      // `canView` / `canSubmit` semantics:
      //   - undefined: all roles can view/submit
      //   - []: treated as "all roles" for backward compatibility with hand-edited
      //     legacy configs that used an empty array to mean "no restriction". The
      //     UI canonicalizes this on save by omitting the key when all roles are
      //     selected (see `serializeGroupSettings`).
      //   - ['Role A', ...]: only the listed roles
      roles: (json.groups.roles ?? []).map((role) => ({
        name: role.name,
        origName: role.name,
        minAssignees: role.minMembers ?? null,
        maxAssignees: role.maxMembers ?? null,
        canAssignRoles: rp.canAssignRoles?.includes(role.name) ?? false,
        canView:
          rp.canView === undefined || rp.canView.length === 0 || rp.canView.includes(role.name),
        canSubmit:
          rp.canSubmit === undefined ||
          rp.canSubmit.length === 0 ||
          rp.canSubmit.includes(role.name),
      })),
    };
  }

  if (!json.groupWork) return null;

  // Legacy schema defaults `studentGroupCreate` / `studentGroupJoin` /
  // `studentGroupLeave` to `false` (the new `groups.studentPermissions` block
  // defaults them to `true`). Mirror the legacy defaults here so the UI shows
  // the permissions that are actually active for the assessment.
  return {
    studentPermissions: {
      canCreateGroup: json.studentGroupCreate ?? false,
      canJoinGroup: json.studentGroupJoin ?? false,
      canLeaveGroup: json.studentGroupLeave ?? false,
      canNameGroup: (json.studentGroupCreate ?? false) && (json.studentGroupChooseName ?? true),
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
