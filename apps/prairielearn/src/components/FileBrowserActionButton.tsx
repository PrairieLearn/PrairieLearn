import { type MouseEvent } from 'react';

/**
 * A file-browser row action rendered as a link (e.g. Edit, Download), used by
 * both the server-rendered `FileBrowser` and the hydrated
 * `DraftQuestionFileBrowser`. When `disabled`, it renders as a disabled button
 * instead, since a link cannot be disabled.
 */
export function FileBrowserActionButton({
  icon,
  label,
  href,
  onClick,
  disabled = false,
  disabledTitle,
  className = 'btn btn-xs btn-secondary text-nowrap',
}: {
  /** Font Awesome icon class, e.g. `fa fa-edit`. */
  icon: string;
  label: string;
  href: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: boolean;
  /** Tooltip explaining why the action is unavailable. */
  disabledTitle?: string;
  /** Bootstrap button classes; defaults to the file-browser row-action style. */
  className?: string;
}) {
  if (disabled) {
    return (
      <button type="button" className={className} title={disabledTitle} disabled>
        <i className={icon} aria-hidden="true" />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <a className={className} href={href} onClick={onClick}>
      <i className={icon} aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}
