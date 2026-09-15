import { type ReactNode, useState, useSyncExternalStore } from 'react';

import { VercelCourseAgentPanelFrame } from './VercelCourseAgentPanelFrame.js';

const subscribe = () => () => {};

export function VercelCourseAgentPanelShell({
  initialOpen,
  loading = false,
  children,
}: {
  initialOpen: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [closing, setClosing] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  function changeOpen(expanded: boolean) {
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
    <VercelCourseAgentPanelFrame
      open={open}
      closing={closing}
      hydrated={hydrated}
      loading={loading}
      onOpenChange={changeOpen}
      onCloseTransitionEnd={() => {
        setOpen(false);
        setClosing(false);
      }}
    >
      {children}
    </VercelCourseAgentPanelFrame>
  );
}
