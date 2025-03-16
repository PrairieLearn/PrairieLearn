import { onDocumentReady } from '@prairielearn/browser-utils';

// Handle when the user expands or collapses the side nav
onDocumentReady(async () => {
  const sideNavTogglerButton = document.querySelector<HTMLButtonElement>('#side-nav-toggler');
  const appContainerDiv = document.querySelector<HTMLDivElement>('#app-container');

  if (!sideNavTogglerButton || !appContainerDiv) return;

  sideNavTogglerButton.addEventListener('click', async () => {
    const sideNavExpanded = !appContainerDiv.classList.contains('collapsed');

    const sideNavButtons = document.querySelectorAll<HTMLButtonElement>('.side-nav-link');

    const courseId = sideNavTogglerButton.getAttribute('data-course-id');
    const courseInstanceId = sideNavTogglerButton.getAttribute('data-course-instance-id');

    if (sideNavExpanded) {
      // Collapse the side nav
      appContainerDiv.classList.add('collapsed');

      // Add tab name tooltips
      sideNavButtons.forEach((button) => {
        button.setAttribute('data-bs-toggle', 'tooltip');
      });
    } else {
      // Expand the side nav
      appContainerDiv.classList.remove('collapsed');

      // Remove tab name tooltips
      sideNavButtons.forEach((button) => {
        button.removeAttribute('data-bs-toggle');
      });
    }

    if (courseInstanceId || courseId) {
      const url = courseInstanceId
        ? `/pl/course_instance/${courseInstanceId}/instructor/side_nav_expanded`
        : `/pl/course/${courseId}/side_nav_expanded`;

      // Update the side nav expanded state
      await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          side_nav_expanded: !sideNavExpanded,
        }),
      });
    }
  });
});
