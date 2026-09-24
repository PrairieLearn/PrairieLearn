import { selectIsInstitutionAdministrator } from '../models/institution.js';

import type { PageAuthzData } from './authz-data-lib.js';
import type { Course } from './db-types.js';
import { idsEqual } from './id.js';

export async function hasCourseStaffAdministrativeAccess({
  course,
  authzData,
}: {
  course: Pick<Course, 'institution_id'>;
  authzData: PageAuthzData;
}): Promise<boolean> {
  if (authzData.is_administrator) return true;

  const isInstitutionAdministrator = await selectIsInstitutionAdministrator({
    institution_id: course.institution_id,
    user_id: authzData.user.id,
  });
  if (!isInstitutionAdministrator) return false;

  // Emulating an institution administrator must not grant an Owner extra privileges.
  return (
    idsEqual(authzData.user.id, authzData.authn_user.id) ||
    (await selectIsInstitutionAdministrator({
      institution_id: course.institution_id,
      user_id: authzData.authn_user.id,
    }))
  );
}
