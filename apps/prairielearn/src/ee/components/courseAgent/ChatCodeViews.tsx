import { getFiletypeFromFileName } from '@pierre/diffs';
import { type ReactNode, useMemo } from 'react';

import {
  CHANGES,
  CodeFile,
  type DiffFile,
  FileChanges,
  bootstrapThemeType,
  diffLanguages,
  languageOf,
  parseFile,
  preloadHighlighting,
  preloadLanguages,
  useLanguagesLoaded,
  viewerStyle,
} from './diffFiles.js';

// This module loads in the background when the chat opens. Starting the highlighter then too
// means the first code block of a reply rarely has to wait for either.
preloadHighlighting();

/** Starts loading the highlighting for a file's language, ahead of showing its changes. */
export function preloadFileHighlighting(path: string) {
  preloadLanguages([getFiletypeFromFileName(path)]).catch(() => undefined);
}

/** One file's changes from an agent's edit, shown without its name, which the row above gives. */
export function ChatDiffView({
  file,
  fallback,
}: {
  file: DiffFile;
  /** Shown instead if the viewer can't read the diff. */
  fallback: ReactNode;
}) {
  const parsed = useMemo(() => {
    try {
      return parseFile(file);
    } catch {
      return null;
    }
  }, [file]);
  const highlighted = useLanguagesLoaded(parsed?.diff ? diffLanguages(parsed.diff) : []);
  if (!parsed || highlighted === null) return fallback;
  const themeType = bootstrapThemeType();
  return (
    <section
      // Lets keyboard users scroll the diff, which Pierre doesn't make focusable.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={`${CHANGES[file.change].label}: ${file.path}`}
      className="course-agent-diff-file border rounded"
      style={viewerStyle(themeType)}
    >
      <FileChanges
        file={file}
        diff={parsed.diff && !highlighted ? { ...parsed.diff, lang: 'text' } : parsed.diff}
        themeType={themeType}
        showFileName={false}
      />
    </section>
  );
}

/** A code block shown inside the conversation, with syntax highlighting. */
export function ChatCodeView({ code, language }: { code: string; language?: string }) {
  const lang = languageOf(language);
  const highlighted = useLanguagesLoaded([lang]);
  if (highlighted === null) {
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }
  const themeType = bootstrapThemeType();
  return (
    <div
      className="course-agent-code border rounded overflow-hidden"
      style={viewerStyle(themeType)}
    >
      <CodeFile contents={code} lang={highlighted ? lang : 'text'} themeType={themeType} />
    </div>
  );
}
