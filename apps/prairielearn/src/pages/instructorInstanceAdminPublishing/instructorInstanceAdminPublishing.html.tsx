import { Hydrate } from '@prairielearn/preact/server';

import { type StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../models/course-instance-publishing-extensions.types.js';

import { PublishingForm } from './components/PublishingForm.js';

export function InstructorInstanceAdminPublishing({
  accessControlExtensions,
  courseInstance,
  hasCourseInstancePermissionEdit,
  hasAccessRules,
  csrfToken,
  origHash,
}: {
  courseInstance: StaffCourseInstance;
  hasCourseInstancePermissionEdit: boolean;
  hasAccessRules: boolean;
  accessControlExtensions: CourseInstancePublishingExtensionWithUsers[];
  csrfToken: string;
  origHash: string;
}) {
  return (
    <>
      <Hydrate>
        <PublishingForm
          courseInstance={courseInstance}
          hasAccessRules={hasAccessRules}
          canEdit={hasCourseInstancePermissionEdit}
          csrfToken={csrfToken}
          origHash={origHash}
          accessControlExtensions={accessControlExtensions}
        />
      </Hydrate>
    </>
  );
}
