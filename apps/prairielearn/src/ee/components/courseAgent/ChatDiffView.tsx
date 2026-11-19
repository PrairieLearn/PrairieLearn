import { type ReactNode, use, useMemo } from 'react';

import {
  CHANGES,
  FileChanges,
  bootstrapThemeType,
  diffStyle,
  loadHighlighter,
  parseFile,
} from './diffFiles.js';
import type { ParsedChatDiff } from './parseChatDiff.js';

/** A diff shown inside the conversation: each file's changes, one after another. */
export default function ChatDiffView({
  diff,
  showFileNames,
  fallback,
}: {
  diff: ParsedChatDiff;
  /** Whether to head each file with its name, when the diff gives one. */
  showFileNames: boolean;
  /** Shown instead if the viewer can't read the diff. */
  fallback: ReactNode;
}) {
  const parsed = useMemo(() => {
    try {
      return diff.files.map(parseFile);
    } catch {
      return null;
    }
  }, [diff]);
  if (!parsed) return fallback;
  // Suspends until the highlighter is ready, so the plain text stays up until the diff can render.
  use(loadHighlighter(parsed));
  const themeType = bootstrapThemeType();
  return (
    <div className="course-agent-diff d-flex flex-column gap-2" style={diffStyle(themeType)}>
      {diff.preamble && <pre className="small mb-0">{diff.preamble}</pre>}
      {parsed.map(({ file, diff: fileDiff }, i) => (
        <section
          // A diff can list the same file more than once.
          // oxlint-disable-next-line react/no-array-index-key
          key={i}
          // Lets keyboard users scroll the diff, which Pierre doesn't make focusable.
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label={file.path ? `${CHANGES[file.change].label}: ${file.path}` : 'Changes'}
          className="course-agent-diff-file border rounded"
        >
          <FileChanges
            file={file}
            diff={fileDiff}
            themeType={themeType}
            showFileName={showFileNames && file.path !== ''}
            showLineNumbers={file.numbered}
          />
        </section>
      ))}
    </div>
  );
}
