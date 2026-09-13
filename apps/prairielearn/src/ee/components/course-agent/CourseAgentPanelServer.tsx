import { CourseAgentPanelFrame } from './CourseAgentPanelFrame.js';

export function CourseAgentPanelServer({
  initialOpen,
}: {
  initialOpen: boolean;
  trpcCsrfToken: string;
  courseId: string;
  userName: string;
  showDiagnostics: boolean;
}) {
  return (
    <CourseAgentPanelFrame
      open={initialOpen}
      closing={false}
      hydrated={false}
      loading={false}
      settingsError={false}
      onOpenChange={() => {}}
      onCloseTransitionEnd={() => {}}
    >
      {null}
    </CourseAgentPanelFrame>
  );
}

CourseAgentPanelServer.displayName = 'CourseAgentPanel';
