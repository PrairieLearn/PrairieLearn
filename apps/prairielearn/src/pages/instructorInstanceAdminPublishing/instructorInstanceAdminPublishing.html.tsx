import { Hydrate } from '@prairielearn/preact/server';

import { type StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import { isRenderableComment } from '../../lib/comments.js';
import type { CourseInstancePublishingRule } from '../../lib/db-types.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../models/course-instance-publishing-extensions.types.js';

import { LegacyAccessRuleCard } from './components/LegacyAccessRuleCard.js';
import { PublishingForm } from './components/PublishingForm.js';

export function InstructorInstanceAdminPublishing({
  accessControlExtensions,
  courseInstance,
  hasCourseInstancePermissionEdit,
  hasCourseInstancePermissionView,
  accessRules,
  csrfToken,
  origHash,
}: {
  courseInstance: StaffCourseInstance;
  hasCourseInstancePermissionEdit: boolean;
  hasCourseInstancePermissionView: boolean;
  accessRules: CourseInstancePublishingRule[];
  accessControlExtensions: CourseInstancePublishingExtensionWithUsers[];
  csrfToken: string;
  origHash: string;
}) {
  const showComments = accessRules.some((access_rule) =>
    isRenderableComment(access_rule.json_comment),
  );

  return (
    <>
      <Hydrate>
        <PublishingForm
          courseInstance={courseInstance}
          hasAccessRules={accessRules.length > 0}
          canEdit={hasCourseInstancePermissionEdit}
          csrfToken={csrfToken}
          origHash={origHash}
          accessControlExtensions={accessControlExtensions}
        />
      </Hydrate>
      {accessRules.length > 0 && (
        <LegacyAccessRuleCard
          accessRules={accessRules}
          showComments={showComments}
          courseInstance={courseInstance}
          hasCourseInstancePermissionView={hasCourseInstancePermissionView}
          hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
          csrfToken={csrfToken}
          origHash={origHash}
        />
      )}
    </>
  );
}
