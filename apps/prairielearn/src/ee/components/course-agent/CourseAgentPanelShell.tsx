import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState, useSyncExternalStore } from 'react';

import { useTRPC } from '../../../trpc/course/context.js';

import { CourseAgentPanelFrame } from './CourseAgentPanelFrame.js';

const subscribe = () => () => {};

export function CourseAgentPanelShell({
  initialOpen,
  loading = false,
  children,
}: {
  initialOpen: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const settings = useMutation(trpc.courseAgent.settings.mutationOptions());
  const [open, setOpen] = useState(initialOpen);
  const [closing, setClosing] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  function changeOpen(expanded: boolean) {
    settings.mutate({ expanded });
    if (
      !expanded &&
      !window.matchMedia('(min-width: 1200px), (prefers-reduced-motion: reduce)').matches
    ) {
      setClosing(true);
    } else {
      setClosing(false);
      setOpen(expanded);
    }
  }

  return (
    <CourseAgentPanelFrame
      open={open}
      closing={closing}
      hydrated={hydrated}
      loading={loading}
      settingsError={settings.isError}
      onOpenChange={changeOpen}
      onCloseTransitionEnd={() => {
        setOpen(false);
        setClosing(false);
      }}
    >
      {children}
    </CourseAgentPanelFrame>
  );
}
