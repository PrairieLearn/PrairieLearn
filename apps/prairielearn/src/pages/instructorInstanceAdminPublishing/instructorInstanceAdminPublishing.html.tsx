import { Hydrate } from '@prairielearn/preact/server';

import { type CourseInstance } from '../../lib/db-types.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../models/course-instance-publishing-extensions.types.js';

import { PublishingForm } from './components/PublishingForm.js';

export function InstructorInstanceAdminPublishing({
  accessControlExtensions,
  courseInstance,
  hasCourseInstancePermissionEdit,
  csrfToken,
  origHash,
}: {
  courseInstance: CourseInstance;
  hasCourseInstancePermissionEdit: boolean;
  accessControlExtensions: CourseInstancePublishingExtensionWithUsers[];
  csrfToken: string;
  origHash: string;
}) {
  return (
    <>
      <Hydrate>
        <PublishingForm
          courseInstance={courseInstance}
          hasAccessRules={false}
          canEdit={hasCourseInstancePermissionEdit}
          csrfToken={csrfToken}
          origHash={origHash}
          accessControlExtensions={accessControlExtensions}
        />
      </Hydrate>
    </>
  );
}

