import { onDocumentReady } from '@prairielearn/browser-utils';

// Handle when the user expands or collapses the side nav
onDocumentReady(() => {
  // Visible on wider viewports (768px and up)
  const sideNavTogglerButton = document.querySelector<HTMLButtonElement>('#side-nav-toggler');

  // Visible on narrower viewports (less than 768px)
  const sideNavMobileButton = document.querySelector<HTMLButtonElement>('#side-nav-mobile-toggler');

  const sideNavTogglerIcon = document.querySelector<HTMLElement>('#side-nav-toggler-icon');

  const appContainerDiv = document.querySelector<HTMLDivElement>('#app-container');
  const appSideNavDiv = document.querySelector<HTMLDivElement>('.app-side-nav');

  const courseNavToggler = document.querySelector<HTMLButtonElement>('#course-nav-toggler');
  const courseNavDiv = document.querySelector<HTMLDivElement>('#course-nav');

  const navbarDropdown = document.querySelector<HTMLDivElement>('#navbarDropdown');

  if (
    !sideNavTogglerButton ||
    !sideNavMobileButton ||
    !sideNavTogglerIcon ||
    !appContainerDiv ||
    !appSideNavDiv ||
    !courseNavToggler ||
    !courseNavDiv ||
    !navbarDropdown
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

  sideNavMobileButton.addEventListener('click', () => {
    // Animate the side nav
    appContainerDiv.classList.add('animate');
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

    function handleTransitionEnd(event: TransitionEvent) {
      // Ensure that the transition occurred on the app side nav div
      if (event.target !== appSideNavDiv) {
        return;
      }
      // Remove the animation class after the transition ends
      if (appContainerDiv) {
        appContainerDiv.classList.remove('animate');
      }
      if (appSideNavDiv) {
        appSideNavDiv.removeEventListener('transitionend', handleTransitionEnd);
      }
    }

    appSideNavDiv.addEventListener('transitionend', handleTransitionEnd);

    const courseNavExpanded = !courseNavDiv.classList.contains('mobile-collapsed');
    if (courseNavExpanded) {
      // Collapse the course nav when the side nav is expanded
      courseNavDiv.classList.add('mobile-collapsed');
    }
  });

  courseNavToggler.addEventListener('click', () => {
    const courseNavExpanded = !courseNavDiv.classList.contains('mobile-collapsed');

    // Animate the course nav
    appContainerDiv.classList.add('animate');

    if (courseNavExpanded) {
      // Collapse the course nav
      courseNavDiv.classList.add('mobile-collapsed');
    } else {
      // Expand the course nav
      courseNavDiv.classList.remove('mobile-collapsed');
    }

    function handleTransitionEnd(event: TransitionEvent) {
      // Ensure that the transition occurred on the course nav div
      if (event.target !== courseNavDiv) {
        return;
      }
      // Remove the animation class after the transition ends
      if (appContainerDiv) {
        appContainerDiv.classList.remove('animate');
      }
      if (courseNavDiv) {
        courseNavDiv.removeEventListener('transitionend', handleTransitionEnd);
      }
    }

    courseNavDiv.addEventListener('transitionend', handleTransitionEnd);

    const sideNavExpanded = !appContainerDiv.classList.contains('mobile-collapsed');
    if (sideNavExpanded) {
      // Collapse the side nav when the course nav is expanded
      appContainerDiv.classList.add('mobile-collapsed');
    }
  });
  // If the user is on a larger viewport and opens the user dropdown menu,
  // expand the course nav on mobile so they can continue interacting with it
  // if they shrink their viewport to a small size.

  // This also prevents several user interface glitches that are related to
  // the dropdown closing while sidebar collapsing occurs.
  navbarDropdown.addEventListener('show.bs.dropdown', () => {
    // Do not expand the course nav if on a smaller viewport.
    if (window.innerWidth < 768) {
      return;
    }
    // Expand the course nav on mobile
    courseNavDiv.classList.remove('mobile-collapsed');

    // Collapse the side nav on mobile
    if (!appContainerDiv.classList.contains('mobile-collapsed')) {
      appContainerDiv.classList.add('mobile-collapsed');
    }
  });

  // If the user closes the user dropdown menu, collapse the course nav
  // on mobile / smaller viewports.

  // This also prevents several user interface glitches that are related to
  // the dropdown closing while sidebar collapsing occurs.
  navbarDropdown.addEventListener('hide.bs.dropdown', () => {
    // Do not collapse the course nav if on a smaller viewport.
    if (window.innerWidth < 768) {
      return;
    }

    // Collapse the course nav on mobile
    if (!courseNavDiv.classList.contains('mobile-collapsed')) {
      courseNavDiv.classList.add('mobile-collapsed');
    }

    // Collapse the side nav on mobile
    if (!appContainerDiv.classList.contains('mobile-collapsed')) {
      appContainerDiv.classList.add('mobile-collapsed');
    }
  });
});
