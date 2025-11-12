import { Hydrate } from '@prairielearn/preact/server';

import { type StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import { isRenderableComment } from '../../lib/comments.js';
import type { CourseInstanceAccessRule } from '../../lib/db-types.js';

import { CourseInstancePublishingForm } from './components/CourseInstancePublishingForm.js';
import { LegacyAccessRuleCard } from './components/LegacyAccessRuleCard.js';

export function InstructorInstanceAdminPublishing({
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
  accessRules: CourseInstanceAccessRule[];
  csrfToken: string;
  origHash: string;
}) {
  const showComments = accessRules.some((access_rule) =>
    isRenderableComment(access_rule.json_comment),
  );

  return (
    <>
      {accessRules.length > 0 ? (
        <LegacyAccessRuleCard
          accessRules={accessRules}
          showComments={showComments}
          courseInstance={courseInstance}
          hasCourseInstancePermissionView={hasCourseInstancePermissionView}
        />
      ) : (
        <Hydrate>
          <CourseInstancePublishingForm
            courseInstance={courseInstance}
            canEdit={hasCourseInstancePermissionEdit}
            csrfToken={csrfToken}
            origHash={origHash}
          />
        </Hydrate>
      )}
    </>
  );
}
