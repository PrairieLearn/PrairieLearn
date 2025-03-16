import clsx from 'clsx';

import { html } from '@prairielearn/html';

export function SideNavToggleButton({
  forSideNavExpanded,
}: {
  /**
   * If true, when the side nav is expanded, the expanded icon and tooltip will render.
   * Otherwise, when the side nav is collapsed, the collapsed icon and tooltip will render.
   */
  forSideNavExpanded: boolean;
}) {
  return html`
    <div
      class="${clsx('side-nav-toggler-icon', forSideNavExpanded ? 'expanded' : 'collapsed')}"
      data-toggle="tooltip"
      data-placement="right"
      title="${forSideNavExpanded ? 'Collapse side nav' : 'Expand side nav'}"
      aria-hidden="true"
    >
      <i
        class="
          ${clsx('bi', forSideNavExpanded ? 'bi-arrow-bar-left' : 'bi-arrow-bar-right')}
        "
      >
      </i>
    </div>
  `;
}
