import { Fragment, type MouseEvent } from 'react';

import type { DraftEditorSelection } from '../../../../lib/draft-question-files/selection.js';

import { useDraftFileNavigation } from './useDraftFileNavigation.js';

/**
 * Renders the breadcrumb shown above every view of the draft question file
 * panel — the directory listing, the in-editor file, and the binary file
 * preview. Segments are derived from the selection's path: the question root
 * is rendered as "All files", parent directories are linkable, and the active
 * leaf is the selected directory or file itself.
 */
export function DraftQuestionFileBrowserBreadcrumb({
  selection,
  ariaLabel,
  onSelectDirectory,
}: {
  /** The location on display: a selected file, or the directory being browsed. */
  selection: DraftEditorSelection;
  ariaLabel: string;
  /**
   * Called when the user clicks a directory segment. The caller is responsible
   * for any pre-navigation prompts (e.g. unsaved-changes confirmation) before
   * performing the navigation.
   */
  onSelectDirectory: (directory: string | null) => void;
}) {
  const { getSelectionUrl } = useDraftFileNavigation();

  const parts = selection.path?.split('/') ?? [];
  const segments = parts.map((name, index) => ({
    name,
    directory: parts.slice(0, index + 1).join('/'),
    isLeaf: index === parts.length - 1,
  }));

  const handleClick = (directory: string | null) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onSelectDirectory(directory);
  };

  return (
    <nav aria-label={ariaLabel} className="d-flex align-items-baseline font-monospace min-width-0">
      {segments.length === 0 ? (
        <span aria-current="page">All files</span>
      ) : (
        <a
          href={getSelectionUrl({ kind: 'dir', path: null })}
          className="flex-shrink-0"
          onClick={handleClick(null)}
        >
          All files
        </a>
      )}
      {segments.map((segment) => (
        <Fragment key={segment.directory}>
          <span className="mx-1 text-muted">/</span>
          {segment.isLeaf ? (
            <span aria-current="page" className="text-truncate">
              {segment.name}
            </span>
          ) : (
            <a
              href={getSelectionUrl({ kind: 'dir', path: segment.directory })}
              onClick={handleClick(segment.directory)}
            >
              {segment.name}
            </a>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
