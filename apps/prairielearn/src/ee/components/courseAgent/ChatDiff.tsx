import { type ReactNode, Suspense, lazy, useMemo } from 'react';

import type { DiffFile } from './diffFiles.js';

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

/** Starts loading the highlighting for a file's changes, so they are colored as soon as they're shown. */
export function preloadDiffHighlighting(path: string) {
  void views.then((module) => module?.preloadFileHighlighting(path));
}

function PlainCode({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <pre>
      <code className={className}>{children}</code>
    </pre>
  );
}

/** One file's changes from an agent's edit, which start at the first hunk, with no file header. */
export function ChatDiff({
  text,
  path,
  change,
}: {
  text: string;
  path: string;
  change: DiffFile['change'];
}) {
  // The viewer parses and highlights again whenever it is given a new file.
  const file = useMemo(
    () => ({
      path,
      change,
      patch: [
        `--- ${change === 'added' ? '/dev/null' : path}`,
        `+++ ${change === 'deleted' ? '/dev/null' : path}`,
        text,
      ].join('\n'),
    }),
    [text, path, change],
  );
  if (text.trim() === '') return null;
  return (
    <Suspense>
      <LazyChatDiffView file={file} fallback={<PlainCode>{text}</PlainCode>} />
    </Suspense>
  );
}

/** A fenced code block in a reply, syntax-highlighted by the language named after the fence. */
export function ChatCodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  // An empty block has no children at all.
  const code = children ?? '';
  if (typeof code !== 'string') return <PlainCode className={className}>{children}</PlainCode>;
  const language = /(?:^|\s)language-(\S+)/.exec(className ?? '')?.[1];
  return (
    <Suspense>
      <LazyChatCodeView code={code.replace(/\n$/, '')} language={language} />
    </Suspense>
  );
}
