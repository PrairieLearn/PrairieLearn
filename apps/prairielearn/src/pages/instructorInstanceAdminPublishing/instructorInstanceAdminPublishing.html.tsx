import { Hydrate } from '@prairielearn/preact/server';

import { type StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import { isRenderableComment } from '../../lib/comments.js';
import type { CourseInstanceAccessRule } from '../../lib/db-types.js';
import { type CourseInstancePublishingExtensionWithUsers } from '../../models/course-instance-publishing-extensions.types.js';

import { LegacyAccessRuleCard } from './components/LegacyAccessRuleCard.js';
import { PublishingForm } from './components/PublishingForm.js';

export function InstructorInstanceAdminPublishing({
  courseInstance,
  hasCourseInstancePermissionEdit,
  hasCourseInstancePermissionView,
  accessRules,
  publishingExtensions,
  csrfToken,
  origHash,
  isDevMode,
}: {
  courseInstance: StaffCourseInstance;
  hasCourseInstancePermissionEdit: boolean;
  hasCourseInstancePermissionView: boolean;
  accessRules: CourseInstanceAccessRule[];
  publishingExtensions: CourseInstancePublishingExtensionWithUsers[];
  csrfToken: string;
  origHash: string;
  isDevMode: boolean;
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
          publishingExtensions={publishingExtensions}
          isDevMode={isDevMode}
        />
      </Hydrate>
      {accessRules.length > 0 && (
        <LegacyAccessRuleCard
          accessRules={accessRules}
          showComments={showComments}
          courseInstance={courseInstance}
          hasCourseInstancePermissionView={hasCourseInstancePermissionView}
        />
      )}
    </>
  );
}
