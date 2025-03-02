import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(async () => {
  // This updates the CSS classes of the app container when side nav toggling occurs.

  const sideNavTogglerButton = document.querySelector<HTMLButtonElement>('#side-nav-toggler');
  const appContainerDiv = document.querySelector<HTMLDivElement>('#app-container');

  if (!sideNavTogglerButton || !appContainerDiv) return;

  sideNavTogglerButton.addEventListener('click', () => {
    // Check if the app container shows the side nav
    const appContainerShowsSideNav = appContainerDiv.classList.contains('show-side-nav');

    if (appContainerShowsSideNav) {
      // Hide the side nav
      appContainerDiv.classList.remove('show-side-nav');
    } else {
      // Show the side nav
      appContainerDiv.classList.add('show-side-nav');
    }
  });
});
