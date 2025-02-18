import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  // TODO: Check if side nav is in use prior to running this
  // TODO: Persist side nav open state in session storage
  let sideNavOpen = true;
  const sideNavTogglerButton = document.querySelector<HTMLButtonElement>('#side-nav-toggler');
  const sideNavDiv = document.querySelector<HTMLDivElement>('#side-nav');
  const appContainerDiv = document.querySelector<HTMLDivElement>('#app-container');

  if (!sideNavTogglerButton || !sideNavDiv || !appContainerDiv) return;
  sideNavTogglerButton.addEventListener('click', () => {
    if (sideNavOpen) {
      // Close the side nav
      sideNavOpen = false;
      sideNavDiv.style.opacity = '0';
      sideNavDiv.style.display = 'none';
      appContainerDiv.classList.add('no-sidebar');
    } else {
      // Open the side nav
      sideNavOpen = true;
      sideNavDiv.style.opacity = '1';
      sideNavDiv.style.display = 'block';
      appContainerDiv.classList.remove('no-sidebar');
    }
  });
});
