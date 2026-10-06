import { AugmentedError, HttpStatusError } from '@prairielearn/error';

import type { selectCourseUsers } from '../models/course-permissions.js';

import type { parseCourseStaffCsv } from './course-staff-csv.js';
import type { CourseInstance, EnumCourseInstanceRole, EnumCourseRole } from './db-types.js';

type CourseStaff = Awaited<ReturnType<typeof selectCourseUsers>>[number];

export interface CourseStaffSyncState {
  coursePermissionId: string;
  userId: string;
  courseRole: EnumCourseRole | null;
  courseInstanceRoles: {
    courseInstanceId: string;
    courseInstancePermissionId: string | null;
    role: EnumCourseInstanceRole | null;
  }[];
}

export interface CourseStaffSyncRoleChange {
  courseInstanceId: string;
  shortName: string;
  previousRole: EnumCourseInstanceRole;
  role: EnumCourseInstanceRole;
}

export type CourseStaffSyncPreviewRow = {
  uid: string;
  line: number;
  expected: CourseStaffSyncState | null;
} & (
  | { action: 'remove' | 'unchanged' }
  | {
      action: 'add' | 'update';
      courseRole: EnumCourseRole;
      previousCourseRole: EnumCourseRole | null;
      courseInstanceChanges: CourseStaffSyncRoleChange[];
    }
);

/** Computes permission changes only; callers must supply authorized course instances. */
export function computeCourseStaffSyncPreview({
  csv,
  courseInstances,
  staff,
}: {
  csv: Awaited<ReturnType<typeof parseCourseStaffCsv>>;
  courseInstances: Pick<CourseInstance, 'id' | 'short_name'>[];
  staff: {
    user: Pick<CourseStaff['user'], 'id' | 'uid'>;
    course_permission: Pick<CourseStaff['course_permission'], 'id' | 'course_role'>;
    course_instance_roles: CourseStaff['course_instance_roles'];
  }[];
}): {
  rows: CourseStaffSyncPreviewRow[];
  courseInstances: { id: string; shortName: string }[];
  summary: { add: number; update: number; remove: number; unchanged: number };
} {
  const instancesByName = new Map<string, Pick<CourseInstance, 'id' | 'short_name'>[]>();
  for (const instance of courseInstances) {
    const matches = instancesByName.get(instance.short_name) ?? [];
    matches.push(instance);
    instancesByName.set(instance.short_name, matches);
  }
  const resolvedInstances = csv.courseInstanceNames.map((shortName) => {
    const matches = instancesByName.get(shortName) ?? [];
    if (matches.length === 0) {
      throw new HttpStatusError(
        400,
        `Unknown or inaccessible course instance "${shortName}". Use an accessible course instance's short name.`,
      );
    }
    if (matches.length > 1) {
      throw new AugmentedError(
        'Assertion: Duplicate course instance short names found in database',
        {
          data: { shortName, courseInstanceIds: matches.map((instance) => instance.id) },
        },
      );
    }
    return { id: matches[0].id, shortName };
  });
  const staffByUid = new Map(staff.map((row) => [row.user.uid, row]));
  const summary = { add: 0, update: 0, remove: 0, unchanged: 0 };
  const rows = csv.operations.map((operation): CourseStaffSyncPreviewRow => {
    const existing = staffByUid.get(operation.uid);
    const currentRoles = new Map(
      (existing?.course_instance_roles ?? []).map((role) => [role.id, role]),
    );
    // Removal affects every instance, including those omitted from the CSV.
    const expectedRoles =
      operation.action === 'remove'
        ? [...currentRoles.values()].map((role) => ({
            courseInstanceId: role.id,
            courseInstancePermissionId: role.course_instance_permission_id,
            role: role.course_instance_role,
          }))
        : resolvedInstances.map((instance) => ({
            courseInstanceId: instance.id,
            courseInstancePermissionId:
              currentRoles.get(instance.id)?.course_instance_permission_id ?? null,
            role: currentRoles.get(instance.id)?.course_instance_role ?? null,
          }));
    const expected: CourseStaffSyncState | null = existing
      ? {
          coursePermissionId: existing.course_permission.id,
          userId: existing.user.id,
          courseRole: existing.course_permission.course_role,
          courseInstanceRoles: expectedRoles.sort((a, b) =>
            a.courseInstanceId.localeCompare(b.courseInstanceId),
          ),
        }
      : null;
    const base = { uid: operation.uid, line: operation.line, expected };
    if (operation.action === 'remove') {
      const action = existing ? 'remove' : 'unchanged';
      summary[action]++;
      return { ...base, action };
    }
    const courseInstanceChanges = operation.courseInstanceRoles.flatMap((desired, index) => {
      const instance = resolvedInstances[index];
      const previousRole = currentRoles.get(instance.id)?.course_instance_role ?? 'None';
      return previousRole === desired.role
        ? []
        : [
            {
              courseInstanceId: instance.id,
              shortName: instance.shortName,
              previousRole,
              role: desired.role,
            },
          ];
    });
    const previousCourseRole = existing?.course_permission.course_role ?? null;
    if (
      existing &&
      (previousCourseRole ?? 'None') === operation.courseRole &&
      courseInstanceChanges.length === 0
    ) {
      summary.unchanged++;
      return { ...base, action: 'unchanged' };
    }
    const action = existing ? 'update' : 'add';
    summary[action]++;
    return {
      ...base,
      action,
      previousCourseRole,
      courseRole: operation.courseRole,
      courseInstanceChanges,
    };
  });
  return { rows, courseInstances: resolvedInstances, summary };
}
