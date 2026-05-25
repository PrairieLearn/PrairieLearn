import { Fragment, type MouseEvent } from 'react';

import type { DraftQuestionFileBrowserBreadcrumbSegment } from '../lib/draft-question-files/browser.js';
import { getEditorUrlForSelection } from '../lib/draft-question-files/urls.js';

/**
 * Renders the breadcrumb shown above every view of the draft question file
 * panel — the directory listing, the in-editor file, and the binary file
 * preview. The first segment is the question root (rendered as "All files"),
 * and the active segment can be either a directory or the leaf file.
 */
export function DraftQuestionFileBrowserBreadcrumb({
  segments,
  editorUrl,
  search,
  ariaLabel,
  onSelectDirectory,
}: {
  segments: DraftQuestionFileBrowserBreadcrumbSegment[];
  /** Base editor URL used to build directory links. */
  editorUrl: string;
  /** Current page query string, whose unrelated params the links preserve. */
  search: string;
  ariaLabel: string;
  /**
   * Called when the user clicks a directory segment. The caller is responsible
   * for any pre-navigation prompts (e.g. unsaved-changes confirmation) before
   * performing the navigation.
   */
  onSelectDirectory: (directory: string | null) => void;
}) {
  const [root, ...rest] = segments;

  const handleClick = (directory: string | null) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onSelectDirectory(directory);
  };
  const directoryUrl = (directory: string | null) =>
    getEditorUrlForSelection({ editorUrl, selection: { kind: 'dir', path: directory }, search });

  return (
    <nav aria-label={ariaLabel} className="d-flex align-items-baseline font-monospace min-width-0">
      {root.isActive ? (
        <span aria-current="page">All files</span>
      ) : (
        <a href={directoryUrl(null)} className="flex-shrink-0" onClick={handleClick(null)}>
          All files
        </a>
      )}
      {rest.map((segment) => (
        // At most one segment in `rest` is a file leaf (directory: null), so
        // falling back to a constant key for it is unique within the list.
        <Fragment key={segment.directory ?? 'leaf'}>
          <span className="mx-1 text-muted">/</span>
          {segment.isActive ? (
            <span aria-current="page" className="text-truncate">
              {segment.name}
            </span>
          ) : (
            <a href={directoryUrl(segment.directory)} onClick={handleClick(segment.directory)}>
              {segment.name}
            </a>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
