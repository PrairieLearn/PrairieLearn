import { type ComponentProps, type ReactNode, Suspense, lazy, useMemo } from 'react';
import type { ExtraProps, Options } from 'react-markdown';

import {
  COMPLETE_DIFF_PROPERTY,
  type ChatDiffFile,
  parseChatDiff,
  remarkCompleteDiffs,
} from './parseChatDiff.js';

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

function MarkdownPre({ node, ...props }: ComponentProps<'pre'> & ExtraProps) {
  const plain = <pre {...props} />;
  const code = node?.children[0];
  if (code?.type !== 'element' || !code.properties[COMPLETE_DIFF_PROPERTY]) return plain;
  const text = code.children.at(0);
  return <ChatDiff text={text?.type === 'text' ? text.value : ''} fallback={plain} />;
}

/** Markdown options that show a reply's fenced `diff` blocks in the diff viewer. */
export const DIFF_MARKDOWN_OPTIONS = {
  components: { pre: MarkdownPre },
  remarkPlugins: [remarkCompleteDiffs],
} satisfies Options;
