import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(async () => {
  // This updates the CSS classes of the app container when side nav toggling occurs.

  const sideNavTogglerButton = document.querySelector<HTMLButtonElement>('#side-nav-toggler');
  const appContainerDiv = document.querySelector<HTMLDivElement>('#app-container');

  if (!sideNavTogglerButton || !appContainerDiv) return;

  sideNavTogglerButton.addEventListener('click', async () => {
    // Check if the app container shows the side nav
    const appContainerShowsSideNav = appContainerDiv.classList.contains('show-side-nav');
    const sideNavButtons = document.querySelectorAll<HTMLButtonElement>('.side-nav-link');

    const courseId = sideNavTogglerButton.getAttribute('data-course-id');
    const courseInstanceId = sideNavTogglerButton.getAttribute('data-course-instance-id');

    if (appContainerShowsSideNav) {
      // Hide the side nav
      appContainerDiv.classList.remove('show-side-nav');
      // Show all side nav button tooltips
      sideNavButtons.forEach((button) => {
        button.setAttribute('data-toggle', 'tooltip');
      });
      if (courseInstanceId) {
        await fetch(`/pl/course_instance/${courseInstanceId}/instructor/side_nav`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
      } else if (courseId) {
        await fetch(`/pl/course/${courseId}/side_nav`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
      }
    } else {
      // Show the side nav
      appContainerDiv.classList.add('show-side-nav');
      // Remove all side nav button tooltips
      sideNavButtons.forEach((button) => {
        button.removeAttribute('data-toggle');
      });

      if (courseInstanceId) {
        await fetch(`/pl/course_instance/${courseInstanceId}/instructor/side_nav`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ showSideNav: true }),
        });
      } else if (courseId) {
        await fetch(`/pl/course/${courseId}/side_nav`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ showSideNav: true }),
        });
      }
    }
  });
});
