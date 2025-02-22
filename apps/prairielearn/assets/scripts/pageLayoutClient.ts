import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(async () => {
  // TODO: Check if side nav is in use prior to running this

  const sideNavTogglerButton = document.querySelector<HTMLButtonElement>('#side-nav-toggler');
  const appContainerDiv = document.querySelector<HTMLDivElement>('#app-container');

  if (!sideNavTogglerButton || !appContainerDiv) return;
  sideNavTogglerButton.addEventListener('click', () => {
    // Check if appContainerDiv has no-sidebar class
    const appContainerHasNoSidebar = appContainerDiv.classList.contains('no-sidebar');
    if (appContainerHasNoSidebar) {
      // We would like to show the sidebar
      // Remove the no-sidebar class
      appContainerDiv.classList.remove('no-sidebar');
    } else {
      // We would like to hide the sidebar
      // Add the no-sidebar class
      appContainerDiv.classList.add('no-sidebar');
    }
  });
});
