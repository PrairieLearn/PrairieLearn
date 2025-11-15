import { Hydrate } from '@prairielearn/preact/server';

import { type StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import { isRenderableComment } from '../../lib/comments.js';
import type { CourseInstanceAccessRule } from '../../lib/db-types.js';

import { CourseInstancePublishingForm } from './components/CourseInstancePublishingForm.js';
import { LegacyAccessRuleCard } from './components/LegacyAccessRuleCard.js';
import type { CourseInstancePublishingExtensionWithUsers } from './instructorInstanceAdminPublishing.types.js';

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
  origHash: string | null;
  isDevMode: boolean;
}) {
  const showComments = accessRules.some((access_rule) =>
    isRenderableComment(access_rule.json_comment),
  );

  return (
    <>
      {courseInstance.modern_publishing ? (
        <Hydrate>
          <CourseInstancePublishingForm
            courseInstance={courseInstance}
            canEdit={hasCourseInstancePermissionEdit && origHash !== null}
            csrfToken={csrfToken}
            origHash={origHash}
            publishingExtensions={publishingExtensions}
            isDevMode={isDevMode}
          />
        </Hydrate>
      ) : (
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
