import { renderHtml } from '@prairielearn/react';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import type { CourseAgentPanelState } from '../../../lib/course-agent-panel.js';
import { CourseAgentPanel } from '../../components/courseAgent/CourseAgentPanel.js';

export function renderCourseAgentPanel({
  courseId,
  userId,
  authnUserId,
  userName,
  timezone,
  initialPanelState,
  canStartNewWork,
}: {
  courseId: string;
  userId: string;
  authnUserId: string;
  userName: string;
  timezone: string;
  initialPanelState: CourseAgentPanelState;
  canStartNewWork: boolean;
}) {
  return renderHtml(
    <Hydrate>
      <CourseAgentPanel
        courseId={courseId}
        userId={userId}
        userName={userName}
        timezone={timezone}
        initialPanelState={initialPanelState}
        canStartNewWork={canStartNewWork}
        csrfToken={generatePrefixCsrfToken(
          { url: `/pl/course/${courseId}/trpc`, authn_user_id: authnUserId },
          config.secretKey,
        )}
      />
    </Hydrate>,
  );
}
