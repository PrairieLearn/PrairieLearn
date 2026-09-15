import { VercelCourseAgentPanelFrame } from './VercelCourseAgentPanelFrame.js';

export function VercelCourseAgentPanelServer({
  initialOpen,
}: {
  initialOpen: boolean;
  trpcCsrfToken: string;
  streamCsrfToken: string;
  courseId: string;
  userName: string;
  showDiagnostics: boolean;
}) {
  return (
    <VercelCourseAgentPanelFrame
      open={initialOpen}
      closing={false}
      hydrated={false}
      loading={false}
      onOpenChange={() => {}}
      onCloseTransitionEnd={() => {}}
    >
      {null}
    </VercelCourseAgentPanelFrame>
  );
}

VercelCourseAgentPanelServer.displayName = 'VercelCourseAgentPanel';
