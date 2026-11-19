import { type ReactNode, Suspense, lazy, useMemo } from 'react';
import { useIsCodeFenceIncomplete } from 'streamdown';

import { type ChatDiffFile, parseChatDiff } from './parseChatDiff.js';

// The diff renderer and its syntax highlighter are only needed once a conversation shows a diff.
const LazyChatDiffView = lazy(() =>
  import('./ChatDiffView.js').then(
    (module) => module,
    () => ({ default: ({ fallback }: { fallback: ReactNode }) => fallback }),
  ),
);

/**
 * Shows a diff the agent wrote or made as highlighted changes. Text that isn't a readable diff, and
 * a diff whose viewer is still loading, is shown as `fallback`.
 */
export function ChatDiff({
  text,
  path,
  change,
  showFileNames = true,
  fallback,
}: {
  text: string;
  /** The file the diff is for, used when the diff itself names no file. */
  path?: string;
  change?: ChatDiffFile['change'];
  showFileNames?: boolean;
  fallback: ReactNode;
}) {
  // The viewer parses and highlights again whenever it is given a new diff.
  const diff = useMemo(
    () =>
      parseChatDiff(text, path === undefined ? undefined : { path, change: change ?? 'modified' }),
    [text, path, change],
  );
  if (!diff) return fallback;
  return (
    <Suspense fallback={fallback}>
      <LazyChatDiffView diff={diff} showFileNames={showFileNames} fallback={fallback} />
    </Suspense>
  );
}

/** A reply's code block, shown in the diff viewer when it is a finished fenced `diff` block. */
export function DiffCodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  // While a reply streams, an unfinished block is half a diff, so it stays plain text.
  const unfinished = useIsCodeFenceIncomplete();
  const plain = (
    <pre>
      <code className={className}>{children}</code>
    </pre>
  );
  const isDiff = /(?:^|\s)language-(?:diff|patch)(?:\s|$)/.test(className ?? '');
  if (!isDiff || unfinished || typeof children !== 'string') return plain;
  return <ChatDiff text={children} fallback={plain} />;
}
