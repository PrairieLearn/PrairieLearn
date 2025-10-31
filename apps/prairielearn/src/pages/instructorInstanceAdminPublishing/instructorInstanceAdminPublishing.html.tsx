import { Hydrate } from '@prairielearn/preact/server';

import { type StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import { isRenderableComment } from '../../lib/comments.js';
import type { CourseInstanceAccessRule } from '../../lib/db-types.js';

import { LegacyAccessRuleCard } from './components/LegacyAccessRuleCard.js';
import { PublishingForm } from './components/PublishingForm.js';

export function InstructorInstanceAdminPublishing({
  isExampleCourse,
  courseInstance,
  hasCourseInstancePermissionEdit,
  hasCourseInstancePermissionView,
  accessRules,
  csrfToken,
  origHash,
}: {
  isExampleCourse: boolean;
  courseInstance: StaffCourseInstance;
  hasCourseInstancePermissionEdit: boolean;
  hasCourseInstancePermissionView: boolean;
  accessRules: CourseInstanceAccessRule[];
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
        />
      </Hydrate>
      {accessRules.length > 0 && (
        <LegacyAccessRuleCard
          isExampleCourse={isExampleCourse}
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
