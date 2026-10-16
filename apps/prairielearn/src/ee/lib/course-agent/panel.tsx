import { renderHtml } from '@prairielearn/react';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getCourseTrpcUrl } from '../../../lib/client/url.js';
import { config } from '../../../lib/config.js';
import { CourseAgentPanel } from '../../components/courseAgent/CourseAgentPanel.js';

export function renderCourseAgentPanel({
  courseId,
  authnUserId,
  initialOpen,
}: {
  courseId: string;
  authnUserId: string;
  initialOpen: boolean;
}) {
  const csrfToken = (url: string) =>
    generatePrefixCsrfToken({ url, authn_user_id: authnUserId }, config.secretKey);
  return renderHtml(
    <Hydrate>
      <CourseAgentPanel
        courseId={courseId}
        trpcCsrfToken={csrfToken(getCourseTrpcUrl(courseId))}
        chatCsrfToken={csrfToken(`/pl/course/${courseId}/course_agent`)}
        initialOpen={initialOpen}
      />
    </Hydrate>,
  );
}
