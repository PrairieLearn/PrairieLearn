import { type ReactNode, useMemo } from 'react';

import {
  CHANGES,
  CodeFile,
  FileChanges,
  bootstrapThemeType,
  diffLanguages,
  diffStyle,
  languageOf,
  parseFile,
  preloadHighlighting,
  useLanguagesLoaded,
} from './diffFiles.js';
import type { ParsedChatDiff } from './parseChatDiff.js';

// This module loads in the background when the chat opens. Starting the highlighter then too
// means the first code block of a reply rarely has to wait for either.
preloadHighlighting();

/** A diff shown inside the conversation: each file's changes, one after another. */
export function ChatDiffView({
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
  const highlighted = useLanguagesLoaded(
    parsed?.flatMap(({ diff: fileDiff }) => (fileDiff ? diffLanguages(fileDiff) : [])) ?? [],
  );
  if (!parsed) return fallback;
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
            diff={fileDiff && !highlighted ? { ...fileDiff, lang: 'text' } : fileDiff}
            themeType={themeType}
            showFileName={showFileNames && file.path !== ''}
            showLineNumbers={file.numbered}
          />
        </section>
      ))}
    </div>
  );
}

/** A code block shown inside the conversation, with syntax highlighting. */
export function ChatCodeView({ code, language }: { code: string; language?: string }) {
  const lang = languageOf(language);
  const highlighted = useLanguagesLoaded([lang]);
  const themeType = bootstrapThemeType();
  return (
    <div className="course-agent-code border rounded overflow-hidden" style={diffStyle(themeType)}>
      <CodeFile contents={code} lang={highlighted ? lang : 'text'} themeType={themeType} />
    </div>
  );
}
