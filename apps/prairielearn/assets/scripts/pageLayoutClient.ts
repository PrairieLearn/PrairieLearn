import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(async () => {
  // This updates the CSS classes of the app container when side nav toggling occurs.

  const sideNavTogglerButton = document.querySelector<HTMLButtonElement>('#side-nav-toggler');
  const appContainerDiv = document.querySelector<HTMLDivElement>('#app-container');

  if (!sideNavTogglerButton || !appContainerDiv) return;

  sideNavTogglerButton.addEventListener('click', async () => {
    // Check if the app container shows the side nav
    const sideNavExpanded = !appContainerDiv.classList.contains('collapsed');

    const sideNavButtons = document.querySelectorAll<HTMLButtonElement>('.side-nav-link');

    const courseId = sideNavTogglerButton.getAttribute('data-course-id');
    const courseInstanceId = sideNavTogglerButton.getAttribute('data-course-instance-id');

    if (sideNavExpanded) {
      // Collapse the side nav
      appContainerDiv.classList.add('collapsed');

      // Enable tab name tooltips
      sideNavButtons.forEach((button) => {
        button.setAttribute('data-toggle', 'tooltip');
      });
    } else {
      // Expand the side nav
      appContainerDiv.classList.remove('collapsed');

      // Disable tab name tooltips
      sideNavButtons.forEach((button) => {
        button.removeAttribute('data-toggle');
      });
    };

    if (courseInstanceId || courseId) {
      const url = courseInstanceId ? 
        `/pl/course_instance/${courseInstanceId}/instructor/side_nav_expanded` : 
        `/pl/course/${courseId}/side_nav_expanded`;

      await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          side_nav_expanded: collapsed 
        }),
      });
    }
  });
});
