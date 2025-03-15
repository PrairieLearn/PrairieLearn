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
  const icon = forSideNavExpanded ? ExpandedIcon() : CollapsedIcon();

  return html`
    <div
      class="side-nav-toggler-icon ${forSideNavExpanded ? 'expanded' : 'collapsed'}"
      data-toggle="tooltip"
      data-placement="right"
      title="${forSideNavExpanded ? 'Collapse side nav' : 'Expand side nav'}"
      aria-hidden="true"
    >
      ${icon}
    </div>
  `;
}

function ExpandedIcon() {
  // Sidebar Left SVG Vector, copyright (c) 2025 Iconsax: https://www.svgrepo.com/svg/497528/sidebar-left
  return html`
    <?xml version="1.0" encoding="utf-8"?>
    <svg
      width="24px"
      height="24px"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.97 15V9C21.97 4 19.97 2 14.97 2H8.96997C3.96997 2 1.96997 4 1.96997 9V15C1.96997 20 3.96997 22 8.96997 22H14.97C19.97 22 21.97 20 21.97 15Z"
        stroke="#343a40"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M7.96997 2V22"
        stroke="#343a40"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M14.97 9.43994L12.41 11.9999L14.97 14.5599"
        stroke="#343a40"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

function CollapsedIcon() {
  // Sidebar Right SVG Vector, copyright (c) 2025 Iconsax: https://www.svgrepo.com/svg/497526/sidebar-right
  return html`
    <?xml version="1.0" encoding="utf-8"?>
    <svg
      width="24px"
      height="24px"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.97 15V9C21.97 4 19.97 2 14.97 2H8.96997C3.96997 2 1.96997 4 1.96997 9V15C1.96997 20 3.96997 22 8.96997 22H14.97C19.97 22 21.97 20 21.97 15Z"
        stroke="#343a40"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M14.97 2V22"
        stroke="#343a40"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M7.96997 9.43994L10.53 11.9999L7.96997 14.5599"
        stroke="#343a40"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}
