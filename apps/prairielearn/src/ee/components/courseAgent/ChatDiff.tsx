import { type ReactNode, Suspense, lazy, useMemo } from 'react';
import { useIsCodeFenceIncomplete } from 'streamdown';

import { type ChatDiffFile, parseChatDiff } from './parseChatDiff.js';

// The viewer and its syntax highlighter are a large download, so they are kept out of the chat's
// own code. Loading starts as soon as the chat does, rather than at the first code block, so that a
// reply's code rarely has to wait for them. If loading fails, blocks are shown as plain text.
const views = import('./ChatCodeViews.js').catch(() => null);

const LazyChatDiffView = lazy(async () => {
  const module = await views;
  return {
    default: module?.ChatDiffView ?? (({ fallback }: { fallback: ReactNode }) => fallback),
  };
});

const LazyChatCodeView = lazy(async () => {
  const module = await views;
  return {
    default:
      module?.ChatCodeView ?? (({ code }: { code: string }) => <PlainCode>{code}</PlainCode>),
  };
});

function PlainCode({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <pre>
      <code className={className}>{children}</code>
    </pre>
  );
}

/** Holds a block's place the first time the viewer loads, so the block never appears in two forms. */
function Loading() {
  return <div className="course-agent-code-loading border rounded" />;
}

/**
 * Shows a diff the agent wrote or made as highlighted changes. A diff that is still streaming is
 * shown as far as it has come. Text the viewer can't show is rendered as `fallback`.
 */
export function ChatDiff({
  text,
  path,
  change,
  showFileNames = true,
  streaming = false,
  fallback,
}: {
  text: string;
  /** The file the diff is for, used when the diff itself names no file. */
  path?: string;
  change?: ChatDiffFile['change'];
  showFileNames?: boolean;
  /** Whether more of the diff is still to come. */
  streaming?: boolean;
  fallback: ReactNode;
}) {
  // The viewer parses and highlights again whenever it is given a new diff.
  const diff = useMemo(
    () =>
      parseChatDiff(text, {
        known: path === undefined ? undefined : { path, change: change ?? 'modified' },
        streaming,
      }),
    [text, path, change, streaming],
  );
  // Nothing of a diff can be shown before its first line arrives, and an empty one stays empty.
  if (!diff) return streaming || text.trim() === '' ? null : fallback;
  return (
    <Suspense fallback={<Loading />}>
      <LazyChatDiffView diff={diff} showFileNames={showFileNames} fallback={fallback} />
    </Suspense>
  );
}

/**
 * A fenced code block in a reply. Code is syntax-highlighted, and a `diff` block is shown as
 * highlighted changes. Both render this way from their first line, including while streaming.
 */
export function ChatCodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const streaming = useIsCodeFenceIncomplete();
  // An empty block has no children at all.
  const code = children ?? '';
  if (typeof code !== 'string') return <PlainCode className={className}>{children}</PlainCode>;
  const language = /(?:^|\s)language-(\S+)/.exec(className ?? '')?.[1];
  if (language === 'diff' || language === 'patch') {
    return (
      <ChatDiff
        text={code}
        streaming={streaming}
        fallback={<PlainCode className={className}>{code}</PlainCode>}
      />
    );
  }
  return (
    <Suspense fallback={<Loading />}>
      <LazyChatCodeView code={code.replace(/\n$/, '')} language={language} />
    </Suspense>
  );
}
