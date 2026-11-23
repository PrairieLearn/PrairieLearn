const SIDE_NAV_SET_EXPANDED_EVENT = 'side-nav-set-expanded';

/**
 * Expands or collapses the instructor side nav without saving the change as
 * the user's preference, e.g. to make room while a wide editor is open.
 */
export function setSideNavExpandedTemporarily(expanded: boolean): void {
  window.dispatchEvent(new CustomEvent(SIDE_NAV_SET_EXPANDED_EVENT, { detail: { expanded } }));
}

export function onSideNavSetExpanded(callback: (expanded: boolean) => void): void {
  window.addEventListener(SIDE_NAV_SET_EXPANDED_EVENT, (event) => {
    callback((event as CustomEvent<{ expanded: boolean }>).detail.expanded);
  });
}

export function isSideNavExpanded(): boolean {
  const appContainer = document.getElementById('app-container');
  return (
    appContainer?.classList.contains('side-nav-enabled') === true &&
    !appContainer.classList.contains('collapsed')
  );
}
