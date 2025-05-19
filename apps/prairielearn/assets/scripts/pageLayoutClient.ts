import { onDocumentReady } from '@prairielearn/browser-utils';

// Handle when the user expands or collapses the side nav
onDocumentReady(async () => {
  // Visible on desktop viewports (width of 768px and above)
  const sideNavTogglerButton = document.querySelector<HTMLButtonElement>('#side-nav-toggler');

  // Visible on mobile viewports (width of less than 768px)
  const sideNavMobileButton = document.querySelector<HTMLButtonElement>('#side-nav-mobile-toggler');

  const sideNavTogglerIcon = document.querySelector<HTMLElement>('#side-nav-toggler-icon');
  const appContainerDiv = document.querySelector<HTMLDivElement>('#app-container');

  const courseNavToggler = document.querySelector<HTMLButtonElement>('#course-nav-toggler');
  const courseNavContent = document.querySelector<HTMLDivElement>('#course-nav');

  if (
    !sideNavTogglerButton ||
    !appContainerDiv ||
    !sideNavTogglerIcon ||
    !sideNavMobileButton ||
    !courseNavToggler ||
    !courseNavContent
  ) {
    return;
  }

  sideNavTogglerButton.addEventListener('click', async () => {
    const sideNavExpanded = !appContainerDiv.classList.contains('collapsed');

    const sideNavButtons = document.querySelectorAll<HTMLButtonElement>('.side-nav-link');

    if (sideNavExpanded) {
      // Collapse the side nav
      appContainerDiv.classList.add('collapsed');

      // Add tab name tooltips
      sideNavButtons.forEach((button) => {
        button.setAttribute('data-bs-toggle', 'tooltip');
      });

      // Update the side nav toggler button tooltip and icon
      sideNavTogglerButton.setAttribute('data-bs-title', 'Expand side nav');
      sideNavTogglerIcon.classList.replace('bi-arrow-bar-left', 'bi-arrow-bar-right');

      // Bootstrap does not update aria-label when data-bs-title changes, so we update it explicitly
      sideNavTogglerButton.setAttribute('aria-label', 'Expand side nav');
    } else {
      // Expand the side nav
      appContainerDiv.classList.remove('collapsed');

      // Remove tab name tooltips
      sideNavButtons.forEach((button) => {
        button.removeAttribute('data-bs-toggle');
      });

      // Update the side nav toggler button tooltip and icon
      sideNavTogglerButton.setAttribute('data-bs-title', 'Collapse side nav');
      sideNavTogglerIcon.classList.replace('bi-arrow-bar-right', 'bi-arrow-bar-left');

      // Bootstrap does not update aria-label when data-bs-title changes, so we update it explicitly
      sideNavTogglerButton.setAttribute('aria-label', 'Collapse side nav');
    }

    // Update the tooltip title
    const tooltip = window.bootstrap.Tooltip.getInstance(sideNavTogglerButton);
    if (tooltip) {
      // Dispose the current tooltip instance
      tooltip.dispose();
      // Re-initialize the tooltip
      new window.bootstrap.Tooltip(sideNavTogglerButton);
    }

    // Update the side nav expanded state
    await fetch('/pl/side_nav/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        side_nav_expanded: !sideNavExpanded,
      }),
    });
  });

  sideNavMobileButton.addEventListener('click', async () => {
    const sideNavExpanded = !appContainerDiv.classList.contains('mobile-collapsed');
    if (sideNavExpanded) {
      // Collapse the side nav
      appContainerDiv.classList.add('mobile-collapsed');

      // Update the side nav mobile toggler button tooltip and icon
      sideNavMobileButton.setAttribute('data-bs-title', 'Expand side nav');
      sideNavMobileButton.setAttribute('aria-label', 'Expand side nav');
    } else {
      // Expand the side nav
      appContainerDiv.classList.remove('mobile-collapsed');

      // Update the side nav mobile toggler button tooltip and icon
      sideNavMobileButton.setAttribute('data-bs-title', 'Collapse side nav');
      sideNavMobileButton.setAttribute('aria-label', 'Collapse side nav');
    }

    const courseNavExpanded = courseNavContent.classList.contains('show');
    if (courseNavExpanded) {
      // Collapse the course nav when the side nav is expanded
      courseNavContent.classList.remove('show');
      courseNavContent.classList.remove('collapse');
      courseNavContent.classList.add('collapsing');
    }
  });

  courseNavToggler.addEventListener('click', async () => {
    const sideNavExpanded = !appContainerDiv.classList.contains('mobile-collapsed');
    if (sideNavExpanded) {
      // Collapse the side nav when the course nav is expanded
      appContainerDiv.classList.add('mobile-collapsed');
    }
  });
});
